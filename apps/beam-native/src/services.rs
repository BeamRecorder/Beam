//! Application service requests kept separate from UI tree transactions.

use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc::Sender,
    },
};

use crate::json;
use argui_platform::{
    Clipboard,
    file_picker::{FileDialog, FilePickerMode},
};
use serde_json::Value;
#[path = "services/actor.rs"]
mod actor;
pub(crate) use actor::ActorSession;
#[path = "services/events.rs"]
mod events;
#[path = "services/types.rs"]
mod types;
use types::{
    Cancellation, FileReference, MAX_SCRIPT_SERVICE_BYTES, MAX_SERVICE_BYTES, ReplyOutcome,
    ServiceReply, ServiceRequest,
};

type Handler = dyn Fn(Value) -> ServiceOutcome + Send + Sync;
type RequestKey = (u32, String, u64);

/// Terminal result of a native application request.
pub enum ServiceOutcome {
    /// A JSON-compatible value to return to JavaScript.
    Ok(Value),
    /// The user dismissed the native operation.
    Cancelled,
    /// This operation is unavailable on the current target.
    Unsupported(String),
    /// The operation failed after it was accepted.
    Error(String),
    /// An unsolicited native event delivered to application listeners.
    Event(Value),
}

/// A response routed to the owning JavaScript session and window.
pub struct ServiceResponse {
    /// Generation of the JavaScript session that issued the request.
    pub session: u32,
    /// Stable native window key supplied by the request.
    pub window: String,
    /// Request identity within that window and session.
    pub request_id: u64,
    /// Terminal result of the request.
    pub outcome: ServiceOutcome,
}

/// Registry and actor response channel shared by one gallery event pump.
pub(crate) struct ServiceChannels<'a> {
    /// Application-defined and built-in native operations.
    pub(crate) registry: &'a Arc<ServiceRegistry>,
    /// Channel delivering completed operations to the JavaScript actor.
    pub(crate) sender: &'a Sender<ServiceResponse>,
}

impl ServiceResponse {
    /// Encodes this response for the QuickJS bridge.
    #[must_use]
    pub fn json(&self) -> Value {
        let outcome = match &self.outcome {
            ServiceOutcome::Ok(value) => ReplyOutcome::Ok { value },
            ServiceOutcome::Cancelled => ReplyOutcome::Cancelled,
            ServiceOutcome::Event(value) => ReplyOutcome::Event { value },
            ServiceOutcome::Unsupported(message) => ReplyOutcome::Unsupported { message },
            ServiceOutcome::Error(message) => ReplyOutcome::Error { message },
        };
        json::encode(&ServiceReply {
            request_id: self.request_id,
            window: &self.window,
            outcome,
        })
        .expect("service replies contain only JSON-compatible values")
    }
}

/// Host-owned registry of native and application-defined asynchronous services.
#[derive(Default)]
pub struct ServiceRegistry {
    handlers: Mutex<HashMap<(String, String), Arc<Handler>>>,
    pending: Mutex<HashMap<RequestKey, Arc<AtomicBool>>>,
    event_routes: Mutex<HashMap<(u32, String), Sender<ServiceResponse>>>,
    actor_wakes: Mutex<HashMap<u32, std::thread::Thread>>,
}

impl ServiceRegistry {
    /// Creates an empty registry for application-provided services.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds clipboard and file dialog handlers supported by the platform crate.
    #[must_use]
    pub fn with_builtins() -> Self {
        let registry = Self::new();
        if cfg!(any(
            target_os = "linux",
            target_os = "windows",
            target_os = "macos"
        )) {
            // X11 serves clipboard data from the owning process. Dropping the
            // last handle after a write loses it on desktops without a manager.
            let clipboard = Arc::new(Mutex::new(Clipboard::new()));
            let reader = clipboard.clone();
            registry.register("clipboard", "readText", move |_| {
                match reader
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner())
                    .read_text()
                {
                    Ok(text) => ServiceOutcome::Ok(Value::from(text)),
                    Err(error) => ServiceOutcome::Error(error.to_string()),
                }
            });
            registry.register("clipboard", "writeText", move |payload| {
                let Some(text) = payload.get("text").and_then(Value::as_str) else {
                    return ServiceOutcome::Error("clipboard.writeText requires text".into());
                };
                match clipboard
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner())
                    .write_text(text.to_owned())
                {
                    Ok(()) => ServiceOutcome::Ok(Value::Null),
                    Err(error) => ServiceOutcome::Error(error.to_string()),
                }
            });
        }
        for (method, mode) in [
            ("open", FilePickerMode::File),
            ("openMany", FilePickerMode::Files),
            ("save", FilePickerMode::Save),
        ] {
            if !mode.supported() {
                continue;
            }
            registry.register("files", method, move |payload| {
                let mut dialog = FileDialog::new(mode);
                if let Some(title) = payload.get("title").and_then(Value::as_str) {
                    dialog = dialog.title(title);
                }
                if let Some(name) = payload.get("fileName").and_then(Value::as_str) {
                    dialog = dialog.file_name(name);
                }
                match pollster::block_on(dialog.open()) {
                    Ok(Some(files)) => {
                        let references = files
                            .into_iter()
                            .map(|file| FileReference {
                                path: file.path().to_path_buf(),
                                name: file.file_name(),
                            })
                            .collect::<Vec<_>>();
                        if mode == FilePickerMode::Save {
                            json::respond(Ok(references.into_iter().next()))
                        } else {
                            json::respond(Ok(references))
                        }
                    }
                    Ok(None) => ServiceOutcome::Cancelled,
                    Err(error) => ServiceOutcome::Error(error.to_string()),
                }
            });
        }
        registry
    }

    /// Registers a service operation supplied by the native application.
    /// `service` and `method` form a unique key. `handler` receives its JSON
    /// payload on a worker thread and returns a terminal result. Re-registering
    /// a key replaces its previous handler, so applications can override defaults.
    pub fn register(
        &self,
        service: &str,
        method: &str,
        handler: impl Fn(Value) -> ServiceOutcome + Send + Sync + 'static,
    ) {
        self.handlers
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .insert((service.into(), method.into()), Arc::new(handler));
    }

    /// Returns whether `service.method` has a handler on this host.
    #[must_use]
    pub fn supports(&self, service: &str, method: &str) -> bool {
        if service == "host" && method == "supports" {
            return true;
        }
        self.handlers
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .contains_key(&(service.into(), method.into()))
    }

    /// Reports whether `session` still has a native operation in progress.
    #[must_use]
    pub fn has_pending(&self, session: u32) -> bool {
        self.pending
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .keys()
            .any(|key| key.0 == session)
    }

    /// Accepts a JSON request for `session`, dispatches it, and sends one result.
    /// `reply` is the actor channel that owns the calling QuickJS session.
    ///
    /// # Errors
    /// Returns a protocol error for malformed or duplicate request identities.
    pub fn submit(
        self: &Arc<Self>,
        session: u32,
        request: &str,
        reply: Sender<ServiceResponse>,
    ) -> Result<(), String> {
        if request.len() > MAX_SCRIPT_SERVICE_BYTES {
            return Err("application service request exceeds 128 KiB".into());
        }
        let bytes = request.len();
        let request: ServiceRequest = json::parse(request)?;
        if request.request_id == 0 {
            return Err("requestId must be a positive integer".into());
        }
        if request.window.is_empty() {
            return Err("window must be a nonempty string".into());
        }
        let response_limit = if request.service == "teleprompter" {
            MAX_SCRIPT_SERVICE_BYTES
        } else {
            MAX_SERVICE_BYTES
        };
        if bytes > response_limit {
            return Err("application service request exceeds its size limit".into());
        }
        let request_id = request.request_id;
        let window = request.window;
        let service = request.service.as_str();
        let method = request.method.as_str();
        let payload = request.payload;
        let key = (session, window.clone(), request_id);
        let handler = self
            .handlers
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .get(&(service.into(), method.into()))
            .cloned();
        let outcome = if !matches!(
            window.as_str(),
            "main"
                | "region"
                | "regionControls"
                | "regionActions"
                | "countdown"
                | "recorder"
                | "settings"
                | "windowPicker"
                | "windowHighlight"
                | "teleprompter"
        ) {
            Some(ServiceOutcome::Unsupported(format!(
                "window {window} is unavailable"
            )))
        } else if service == "host" && method == "supports" {
            let target_service = payload.get("service").and_then(Value::as_str).unwrap_or("");
            let target_method = payload.get("method").and_then(Value::as_str).unwrap_or("");
            Some(ServiceOutcome::Ok(Value::from(
                self.supports(target_service, target_method),
            )))
        } else if handler.is_none() {
            let message = match (service, method) {
                ("menus", "set") => "Application menus are not connected to this QuickJS gallery host. Argui supports native tray menus through its Rust application runtime, but this host has no menu service.".to_owned(),
                ("shortcuts", "set") => "Global shortcuts are not enabled in this QuickJS gallery host. The Rust API requires the global-shortcuts feature and startup registration; this host has no shortcut service or event routing.".to_owned(),
                _ => format!("{service}.{method} is not registered in this host"),
            };
            Some(ServiceOutcome::Unsupported(message))
        } else {
            None
        };
        let cancelled = Arc::new(AtomicBool::new(false));
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if pending.contains_key(&key) {
            return Err("duplicate service request ID".into());
        }
        pending.insert(key.clone(), Arc::clone(&cancelled));
        drop(pending);
        let registry = Arc::clone(self);
        std::thread::spawn(move || {
            if cancelled.load(Ordering::Acquire) {
                return;
            }
            let result = outcome.unwrap_or_else(|| handler.expect("handler exists")(payload));
            let result = match result {
                ServiceOutcome::Ok(value) if value.to_string().len() > response_limit => {
                    ServiceOutcome::Error(
                        "application service response exceeds its size limit".into(),
                    )
                }
                other => other,
            };
            let mut pending = registry
                .pending
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            if pending
                .get(&key)
                .is_some_and(|active| Arc::ptr_eq(active, &cancelled))
            {
                pending.remove(&key);
            }
            drop(pending);
            if !cancelled.load(Ordering::Acquire) {
                let _ = reply.send(ServiceResponse {
                    session,
                    window,
                    request_id,
                    outcome: result,
                });
                registry.wake_actor(session);
                registry.wake_window("main");
            }
        });
        Ok(())
    }

    /// Cancels one pending request from `session` and `window`.
    pub fn cancel(&self, session: u32, window: &str, request_id: u64) {
        if let Some(flag) = self
            .pending
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .remove(&(session, window.into(), request_id))
        {
            flag.store(true, Ordering::Release);
        }
    }

    /// Parses and cancels one JavaScript request for `session`.
    ///
    /// # Errors
    /// Returns a protocol error for malformed cancellation identity.
    pub fn cancel_json(&self, session: u32, request: &str) -> Result<(), String> {
        let request: Cancellation = json::parse(request)?;
        self.cancel(session, &request.window, request.request_id);
        Ok(())
    }

    /// Cancels every pending result owned by a closing or reloading session.
    pub fn cancel_session(&self, session: u32) {
        self.actor_wakes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .remove(&session);
        self.event_routes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .retain(|(owner, _), _| *owner != session);
        self.pending
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .retain(|key, flag| {
                if key.0 != session {
                    return true;
                }
                flag.store(true, Ordering::Release);
                false
            });
    }
}

#[cfg(test)]
#[path = "../test/services.rs"]
mod tests;
