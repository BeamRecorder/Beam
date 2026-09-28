//! Embedded QuickJS execution for the runtime-neutral gallery module.

#[path = "beam/files.rs"]
pub(crate) mod files;
#[path = "beam/json.rs"]
pub(crate) mod json;

#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
mod beam;
mod delivery;
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
mod desktop_application;
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
pub use desktop_application::BeamApp;
mod effects;
mod hot_reload;
mod i18n;
mod native_metrics;
mod runner;
mod services;
mod telemetry;
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
mod validate;
mod wire;

pub use delivery::{coalesce_virtual_windows, event_json, ui_event_payload};
pub use effects::registry_from_json;
pub use native_metrics::parse_control;
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
pub use native_metrics::profile_json;
pub use services::{ServiceOutcome, ServiceRegistry, ServiceResponse};
pub use wire::decode_wire_operations;

#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
pub use runner::{run_desktop, run_desktop_with_services};

#[cfg(target_os = "android")]
argui_runtime::android_main!(runner::run_android);

use argui_runtime::ThemeBridge;
use rquickjs::{CaughtError, Context, Ctx, Error, Function, Module, Object, Runtime};
use std::{cell::RefCell, rc::Rc, time::Duration};

/// A gallery session with its own QuickJS runtime and pending-job queue.
pub struct QuickJsGallery {
    runtime: Runtime,
    context: Context,
}

impl QuickJsGallery {
    /// Loads `source` as an ES module and invokes `entry` with the native bridge and `contract_json`.
    /// The `commit` callback forwards native operation batches and returns an error string.
    /// Returns the mounted gallery session.
    ///
    /// # Errors
    /// Returns an error when the script, contract, or initial mount fails.
    pub fn new(
        source: &str,
        contract_json: &str,
        entry: &str,
        commit: impl Fn(String) -> String + 'static,
    ) -> Result<Self, String> {
        Self::new_with_control(source, contract_json, entry, commit, |_| {
            "native controls unavailable".into()
        })
    }

    /// Loads a gallery module with a native control callback in addition to commits.
    ///
    /// `source`, `contract_json`, and `entry` identify the JavaScript module;
    /// `commit` forwards host operations and `control` forwards renderer controls.
    /// Returns the mounted session.
    ///
    /// # Errors
    /// Returns an error when the script, contract, or initial mount fails.
    pub fn new_with_control(
        source: &str,
        contract_json: &str,
        entry: &str,
        commit: impl Fn(String) -> String + 'static,
        control: impl Fn(String) -> String + 'static,
    ) -> Result<Self, String> {
        Self::new_with_services(
            source,
            contract_json,
            entry,
            commit,
            control,
            |_| "application services unavailable".into(),
            |_| String::new(),
        )
    }

    /// Loads a module with separate application request and cancellation callbacks.
    /// `source`, `contract_json`, and `entry` select the module; `commit` sends UI
    /// transactions, `control` sends renderer controls, `request` starts an
    /// asynchronous native service operation, and `cancel` abandons one result.
    /// Returns the mounted session.
    ///
    /// # Errors
    /// Returns a JavaScript or schema error when mounting fails.
    pub fn new_with_services(
        source: &str,
        contract_json: &str,
        entry: &str,
        commit: impl Fn(String) -> String + 'static,
        control: impl Fn(String) -> String + 'static,
        request: impl Fn(String) -> String + 'static,
        cancel: impl Fn(String) -> String + 'static,
    ) -> Result<Self, String> {
        Self::new_internal(
            source,
            contract_json,
            entry,
            commit,
            control,
            request,
            cancel,
        )
    }

    /// Installs the shared native bridge before mounting `entry` from `source`.
    /// `contract_json` supplies the host ABI; `commit` forwards UI transactions;
    /// `control`, `request`, and `cancel` forward native service work.
    ///
    /// # Errors
    /// Returns a QuickJS or schema error while evaluating or mounting the bundle.
    #[allow(clippy::too_many_arguments)]
    fn new_internal(
        source: &str,
        contract_json: &str,
        entry: &str,
        commit: impl Fn(String) -> String + 'static,
        control: impl Fn(String) -> String + 'static,
        request: impl Fn(String) -> String + 'static,
        cancel: impl Fn(String) -> String + 'static,
    ) -> Result<Self, String> {
        let runtime = Runtime::new().map_err(js_error)?;
        let context = Context::full(&runtime).map_err(js_error)?;
        let i18n = Rc::new(RefCell::new(i18n::NativeI18n::default()));
        let theme = Rc::new(RefCell::new(ThemeBridge::default()));
        theme.borrow_mut().set_system_scheme(
            argui_platform::SystemPreferences::detect(Default::default())
                .color_scheme
                .value,
        )?;
        context.with(|ctx| {
            let globals = ctx.globals();
            globals
                .set(
                    "__arguiLog",
                    Function::new(ctx.clone(), |level: String, message: String| {
                        eprintln!("[beam-ui:{level}] {message}");
                    })
                    .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            globals
                .set("__arguiMobile", cfg!(target_os = "android"))
                .map_err(|error| js_context_error(&ctx, error))?;
            globals
                .set("__arguiContractJson", contract_json)
                .map_err(|error| js_context_error(&ctx, error))?;
            globals
                .set(
                    "__arguiSend",
                    Function::new(ctx.clone(), commit)
                        .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            globals
                .set(
                    "__arguiControl",
                    Function::new(ctx.clone(), control)
                        .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            globals
                .set(
                    "__arguiService",
                    Function::new(ctx.clone(), request)
                        .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            globals
                .set(
                    "__arguiCancelService",
                    Function::new(ctx.clone(), cancel)
                        .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            let loader = Rc::clone(&i18n);
            globals
                .set(
                    "__arguiI18nLoad",
                    Function::new(ctx.clone(), move |json: String| {
                        loader.borrow_mut().load(&json)
                    })
                    .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            let selector = Rc::clone(&i18n);
            globals
                .set(
                    "__arguiI18nSelect",
                    Function::new(ctx.clone(), move |locale: String| {
                        selector.borrow_mut().select(&locale)
                    })
                    .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            globals
                .set(
                    "__arguiI18nTr",
                    Function::new(ctx.clone(), move |id: String, args: String| {
                        i18n.borrow().translate(&id, &args)
                    })
                    .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            let create_theme = Rc::clone(&theme);
            globals
                .set(
                    "__arguiThemeCreate",
                    Function::new(ctx.clone(), move |json: String| {
                        theme_result(create_theme.borrow_mut().create(&json))
                    })
                    .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            let update_theme = Rc::clone(&theme);
            globals
                .set(
                    "__arguiThemeUpdate",
                    Function::new(ctx.clone(), move |id: u32, json: String| {
                        theme_result(update_theme.borrow_mut().update(u64::from(id), &json))
                    })
                    .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            let dispose_theme = Rc::clone(&theme);
            globals
                .set(
                    "__arguiThemeDispose",
                    Function::new(ctx.clone(), move |id: u32| {
                        dispose_theme.borrow_mut().dispose(u64::from(id));
                    })
                    .map_err(|error| js_context_error(&ctx, error))?,
                )
                .map_err(|error| js_context_error(&ctx, error))?;
            let _: () = ctx
                .eval(include_str!("bootstrap.js"))
                .map_err(|error| js_context_error(&ctx, error))?;
            let module = Module::declare(ctx.clone(), "gallery-core.mjs", source)
                .map_err(|error| js_context_error(&ctx, error))?;
            let (module, evaluated) = CaughtError::catch(&ctx, module.eval())
                .map_err(|error| format!("QuickJS: {}", caught_error(error)))?;
            CaughtError::catch(&ctx, evaluated.finish::<()>())
                .map_err(|error| format!("QuickJS module: {}", caught_error(error)))?;
            let mount: Function = module
                .get(entry)
                .map_err(|error| js_context_error(&ctx, error))?;
            let bridge: Object = globals
                .get("__arguiBridge")
                .map_err(|error| js_context_error(&ctx, error))?;
            let hash: String = ctx
                .eval("JSON.parse(__arguiContractJson).abiHash")
                .map_err(|error| js_context_error(&ctx, error))?;
            let dispose: Function = CaughtError::catch(&ctx, mount.call((bridge, hash)))
                .map_err(|error| format!("QuickJS: {}", caught_error(error)))?;
            globals
                .set("__arguiDispose", dispose)
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        let gallery = Self { runtime, context };
        gallery.drain_jobs()?;
        Ok(gallery)
    }

    /// Delivers a native callback encoded as JSON to the mounted application.
    ///
    /// # Errors
    /// Returns an error if the callback or its scheduled microtasks fail.
    pub fn deliver(&self, delivery_json: &str) -> Result<(), String> {
        self.context.with(|ctx| {
            let deliver: Function = ctx
                .globals()
                .get("__arguiDeliver")
                .map_err(|error| js_context_error(&ctx, error))?;
            deliver
                .call::<_, ()>((delivery_json,))
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        self.drain_jobs()
    }

    /// Delivers a real renderer profile encoded as JSON to the active subscriber.
    ///
    /// `profile_json` contains the latest native CPU/GPU/damage sample. Returns
    /// after its JavaScript callback and queued microtasks complete.
    ///
    /// # Errors
    /// Returns an error if the profile callback fails.
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub fn deliver_profile(&self, profile_json: &str) -> Result<(), String> {
        self.context.with(|ctx| {
            let deliver: Function = ctx
                .globals()
                .get("__arguiDeliverProfile")
                .map_err(|error| js_context_error(&ctx, error))?;
            deliver
                .call::<_, ()>((profile_json,))
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        self.drain_jobs()
    }

    /// Delivers one completed application request to this live QuickJS session.
    /// `response_json` is a terminal response with request and window identity.
    ///
    /// # Errors
    /// Returns an error if the response handler or its microtasks fail.
    pub fn deliver_service(&self, response_json: &str) -> Result<(), String> {
        self.context.with(|ctx| {
            let deliver: Function = ctx
                .globals()
                .get("__arguiDeliverService")
                .map_err(|error| js_context_error(&ctx, error))?;
            deliver
                .call::<_, ()>((response_json,))
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        self.drain_jobs()
    }

    /// Returns definitions registered by imported JavaScript WGSL modules.
    ///
    /// Returns the JSON array accumulated before the module mounted.
    ///
    /// # Errors
    /// Returns an error if the QuickJS registry cannot be serialized.
    pub fn effect_definitions_json(&self) -> Result<String, String> {
        self.context.with(|ctx| {
            ctx.eval("JSON.stringify(globalThis.__arguiNativeEffects)")
                .map_err(|error| js_context_error(&ctx, error))
        })
    }

    /// Fires due JavaScript interval callbacks at `elapsed_ms` since startup.
    ///
    /// # Errors
    /// Returns an error if a timer or its scheduled microtasks fail.
    pub fn tick(&self, elapsed_ms: f64) -> Result<(), String> {
        self.context.with(|ctx| {
            let tick: Function = ctx
                .globals()
                .get("__arguiTick")
                .map_err(|error| js_context_error(&ctx, error))?;
            tick.call::<_, ()>((elapsed_ms,))
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        self.drain_jobs()
    }

    /// Returns a bounded sleep until the next interval; idle sessions sleep for one second.
    ///
    /// # Errors
    /// Returns an error if the timer scheduler cannot be queried.
    pub fn next_wake(&self, elapsed_ms: f64) -> Result<Duration, String> {
        let remaining: Option<f64> = self.context.with(|ctx| {
            let next: Function = ctx
                .globals()
                .get("__arguiNextTimer")
                .map_err(|error| js_context_error(&ctx, error))?;
            next.call((elapsed_ms,))
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        let milliseconds = remaining.unwrap_or(1000.0).clamp(0.0, 1000.0);
        Ok(Duration::from_secs_f64(milliseconds / 1000.0))
    }

    /// Unmounts the application and commits disposal of its native root.
    ///
    /// # Errors
    /// Returns an error if the disposer or its scheduled microtasks fail.
    pub fn dispose(&self) -> Result<(), String> {
        self.context.with(|ctx| {
            let dispose: Function = ctx
                .globals()
                .get("__arguiDispose")
                .map_err(|error| js_context_error(&ctx, error))?;
            dispose
                .call::<_, ()>(())
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        self.drain_jobs()
    }

    /// Runs every queued Promise or Solid effect job to a stable boundary.
    fn drain_jobs(&self) -> Result<(), String> {
        while self.runtime.execute_pending_job().map_err(|error| {
            error.0.with(|ctx| {
                format!(
                    "QuickJS job: {}",
                    caught_error(CaughtError::from_error(&ctx, Error::Exception))
                )
            })
        })? {}
        let microtask_error: Option<String> = self.context.with(|ctx| {
            ctx.globals()
                .get("__arguiMicrotaskError")
                .map_err(|error| js_context_error(&ctx, error))
        })?;
        if let Some(error) = microtask_error {
            return Err(format!("QuickJS microtask: {error}"));
        }
        Ok(())
    }
}

/// Converts a QuickJS API error into a message suitable for the native actor.
fn js_error(error: impl std::fmt::Debug) -> String {
    format!("QuickJS: {error:?}")
}

/// Extracts the thrown JavaScript value, including its message and stack.
///
/// `ctx` is the context where `error` occurred. Returns a readable diagnostic.
fn js_context_error(ctx: &Ctx<'_>, error: Error) -> String {
    format!(
        "QuickJS: {}",
        caught_error(CaughtError::from_error(ctx, error))
    )
}

/// Formats a caught JavaScript error with its message and source stack.
///
/// `error` contains a native API error or a thrown JavaScript value. Returns its diagnostic.
fn caught_error(error: CaughtError<'_>) -> String {
    match error {
        CaughtError::Exception(exception) => {
            let message = exception
                .message()
                .unwrap_or_else(|| "JavaScript exception".into());
            match exception.stack() {
                Some(stack) if !stack.is_empty() => format!("{message}\n{stack}"),
                _ => message,
            }
        }
        CaughtError::Value(value) => format!("JavaScript threw {value:?}"),
        CaughtError::Error(error) => error.to_string(),
    }
}

/// Encodes a theme bridge failure as a JSON error consumed by the JS wrapper.
fn theme_result(result: Result<String, String>) -> String {
    result.unwrap_or_else(json::error_response)
}
