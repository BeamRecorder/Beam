//! Native Beam window, tray, and shortcut services.

mod activation;
mod config;
pub(crate) mod region;
mod types;
mod ui_state;
mod window_picker;
mod window_types;
mod windows;

pub(crate) use config::beam_config;
use config::complete_menu;
pub(crate) use ui_state::register_ui_state_services;
pub(crate) use window_picker::register_window_picker_services;
pub(crate) use windows::register_auxiliary_windows;

use std::{
    sync::{
        Arc, Mutex,
        mpsc::{self, Sender},
    },
    time::Duration,
};

use argui_platform::{
    CloseBehavior, GlobalShortcut, GlobalShortcutState, PlatformEvent, TrayAction, TrayConfig,
    TrayEvent, TrayItemId, TrayMenuItem, TrayPointerButton, WindowKey,
};
use argui_runtime::{
    AppCommand, AppEvent, AppModel, AppUpdate, NativeHostApplicationRequest, RuntimeEvent,
    WindowEnvironment, WindowRuntimeEvent,
};
use argui_ui::Element;
use serde_json::Value;
use types::{NativeEvent, ShortcutState};

use crate::services::{ServiceOutcome, ServiceRegistry, ServiceResponse};

/// Publishes a committed preference snapshot to all native presentations.
pub(crate) fn preferences_changed(registry: &ServiceRegistry, preferences: &Value) {
    match crate::json::encode(&NativeEvent::PreferencesChanged {
        preferences: preferences.clone(),
    }) {
        Ok(event) => registry.broadcast_event(&event),
        Err(error) => eprintln!("Beam preferences event: {error}"),
    }
}

/// Native application policy for tray and global shortcut activations.
pub struct BeamApp {
    events: Sender<ServiceResponse>,
    region: Arc<Mutex<region::RegionState>>,
    services: Arc<ServiceRegistry>,
}

impl BeamApp {
    /// Routes native events to the active Solid view.
    pub(crate) fn new(
        events: Sender<ServiceResponse>,
        region: Arc<Mutex<region::RegionState>>,
        services: Arc<ServiceRegistry>,
    ) -> Self {
        Self {
            events,
            region,
            services,
        }
    }
}

impl AppModel for BeamApp {
    fn image_assets(&self) -> Vec<argui_paint::ImageAsset> {
        self.region
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .images()
    }

    fn view(&self, window: &WindowKey, _environment: WindowEnvironment) -> Option<Element> {
        (window.as_str() == "region").then(|| {
            self.region
                .lock()
                .unwrap_or_else(|poison| poison.into_inner())
                .view()
        })
    }

    fn update(&mut self, event: &AppEvent) -> AppUpdate {
        let update = if matches!(event, AppEvent::Window { window, .. } | AppEvent::HostMessage { window, .. } if window.as_str() == "region")
        {
            self.region
                .lock()
                .unwrap_or_else(|poison| poison.into_inner())
                .update(event, &self.services)
        } else {
            match event {
                AppEvent::Window {
                    window,
                    event: PlatformEvent::VisibilityChanged(true) | PlatformEvent::Focused(_),
                } if matches!(
                    window.as_str(),
                    "countdown" | "recorder" | "regionControls" | "regionActions"
                ) =>
                {
                    AppUpdate::none().command(AppCommand::SetWindowLevel {
                        window: window.clone(),
                        level: argui_platform::WindowLevel::AlwaysOnTop,
                    })
                }
                AppEvent::Tray(TrayEvent::Click {
                    button: TrayPointerButton::Primary,
                    ..
                })
                | AppEvent::Tray(TrayEvent::Action {
                    action: TrayAction::Custom(_),
                    ..
                }) => AppUpdate::none().command(AppCommand::FocusWindow(WindowKey::main())),
                AppEvent::GlobalShortcut(event) if event.state == GlobalShortcutState::Pressed => {
                    AppUpdate::none()
                }
                AppEvent::Window {
                    window,
                    event: PlatformEvent::PreferencesChanged(preferences),
                } if window.as_str() == "main" => {
                    let scheme = match preferences.color_scheme.value {
                        argui_core::ColorScheme::Light => "light",
                        argui_core::ColorScheme::Dark => "dark",
                    };
                    if let Err(error) = ui_state::send_event(
                        &self.events,
                        "main",
                        NativeEvent::SystemScheme {
                            scheme: scheme.into(),
                        },
                    ) {
                        eprintln!("Beam preference event: {error}");
                    }
                    AppUpdate::none()
                }
                _ => AppUpdate::none(),
            }
        };
        activation::restore_open_windows(event, update)
    }
}

#[derive(Clone)]
struct TrayState {
    config: TrayConfig,
    enabled: bool,
    preferred_close_behavior: CloseBehavior,
}

/// Registers TSX-callable tray, close-policy, focus, and global-shortcut services.
/// `registry` owns the handlers; `sender` posts requests to the UI thread; `tray`
/// contains the initial visible icon and menu.
pub(crate) fn register_application_services(
    registry: &ServiceRegistry,
    sender: Sender<NativeHostApplicationRequest>,
    tray: Option<TrayConfig>,
) {
    let tray_enabled = tray.is_some();
    let state = Arc::new(Mutex::new(TrayState {
        config: tray.unwrap_or_else(|| TrayConfig {
            tooltip: Some("Beam".into()),
            title: Some("Beam".into()),
            menu: complete_menu(Vec::new()),
            ..TrayConfig::default()
        }),
        enabled: tray_enabled,
        preferred_close_behavior: if tray_enabled {
            CloseBehavior::Hide
        } else {
            CloseBehavior::Quit
        },
    }));
    let menu_state = Arc::clone(&state);
    let menu_sender = sender.clone();
    registry.register("menus", "set", move |payload| {
        let Some(items) = payload.get("items").and_then(Value::as_array) else {
            return ServiceOutcome::Error("menus.set requires an items array".into());
        };
        let custom = match parse_menu_items(items, 0) {
            Ok(custom) => custom,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let mut state = menu_state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let mut config = state.config.clone();
        config.menu = complete_menu(custom);
        if let Err(error) = config.validate() {
            return ServiceOutcome::Error(error.to_string());
        }
        if state.enabled {
            let outcome = dispatch(&menu_sender, |reply| {
                NativeHostApplicationRequest::SetTray(Some(config.clone()), reply)
            });
            if !matches!(outcome, ServiceOutcome::Ok(_)) {
                return outcome;
            }
        }
        state.config = config;
        ServiceOutcome::Ok(Value::Null)
    });
    let tray_state = Arc::clone(&state);
    let tray_sender = sender.clone();
    registry.register("tray", "setEnabled", move |payload| {
        let Some(enabled) = payload.get("enabled").and_then(Value::as_bool) else {
            return ServiceOutcome::Error("tray.setEnabled requires enabled: boolean".into());
        };
        let mut state = tray_state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if state.enabled == enabled {
            return ServiceOutcome::Ok(Value::Null);
        }
        if !enabled {
            let outcome = dispatch(&tray_sender, |reply| {
                NativeHostApplicationRequest::SetCloseBehavior(CloseBehavior::Quit, reply)
            });
            if !matches!(outcome, ServiceOutcome::Ok(_)) {
                return outcome;
            }
        }
        let config = enabled.then(|| state.config.clone());
        let outcome = dispatch(&tray_sender, |reply| {
            NativeHostApplicationRequest::SetTray(config, reply)
        });
        if !matches!(outcome, ServiceOutcome::Ok(_)) {
            return outcome;
        }
        if enabled {
            let behavior = state.preferred_close_behavior;
            let outcome = dispatch(&tray_sender, |reply| {
                NativeHostApplicationRequest::SetCloseBehavior(behavior, reply)
            });
            if !matches!(outcome, ServiceOutcome::Ok(_)) {
                return outcome;
            }
        }
        state.enabled = enabled;
        ServiceOutcome::Ok(Value::Null)
    });
    let close_sender = sender.clone();
    let close_state = Arc::clone(&state);
    registry.register("windows", "setCloseBehavior", move |payload| {
        let behavior = match payload.get("behavior").and_then(Value::as_str) {
            Some("hide") => CloseBehavior::Hide,
            Some("quit") => CloseBehavior::Quit,
            _ => return ServiceOutcome::Error("close behavior must be 'hide' or 'quit'".into()),
        };
        let outcome = dispatch(&close_sender, |reply| {
            NativeHostApplicationRequest::SetCloseBehavior(behavior, reply)
        });
        if matches!(outcome, ServiceOutcome::Ok(_)) {
            close_state
                .lock()
                .unwrap_or_else(|poison| poison.into_inner())
                .preferred_close_behavior = behavior;
        }
        outcome
    });
    let focus_sender = sender.clone();
    registry.register("windows", "focus", move |_| {
        dispatch(&focus_sender, NativeHostApplicationRequest::FocusWindow)
    });
    let shortcut_sender = sender.clone();
    registry.register("shortcuts", "set", move |payload| {
        let Some(items) = payload.get("shortcuts").and_then(Value::as_array) else {
            return ServiceOutcome::Error("shortcuts.set requires a shortcuts array".into());
        };
        let shortcuts = match items
            .iter()
            .map(|item| {
                let id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("shortcut id must be a string")?;
                let accelerator = item
                    .get("accelerator")
                    .and_then(Value::as_str)
                    .ok_or("shortcut accelerator must be a string")?;
                Ok::<_, &str>(GlobalShortcut::new(id, accelerator))
            })
            .collect::<Result<Vec<_>, _>>()
        {
            Ok(shortcuts) => shortcuts,
            Err(error) => return ServiceOutcome::Error(error.into()),
        };
        dispatch(&shortcut_sender, |reply| {
            NativeHostApplicationRequest::SetGlobalShortcuts(shortcuts, reply)
        })
    });
    windows::register_window_services(registry, sender);
}

/// Parses a bounded list of translated menu labels and associated actions.
/// `items` are JSON menu descriptions; `depth` prevents unbounded nesting.
///
/// # Errors
/// Returns a field or nesting validation error.
fn parse_menu_items(items: &[Value], depth: usize) -> Result<Vec<TrayMenuItem>, String> {
    if depth > 8 || items.len() > 100 {
        return Err("tray menu exceeds its depth or item limit".into());
    }
    items
        .iter()
        .map(|item| {
            if item.get("separator").and_then(Value::as_bool) == Some(true) {
                return Ok(TrayMenuItem::Separator);
            }
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .ok_or("menu item id must be a nonempty string")?;
            let label = item
                .get("label")
                .and_then(Value::as_str)
                .filter(|label| !label.is_empty())
                .ok_or("menu item label must be a nonempty string")?
                .to_owned();
            let enabled = item.get("enabled").and_then(Value::as_bool).unwrap_or(true);
            if let Some(children) = item.get("children") {
                let children = children
                    .as_array()
                    .ok_or("menu children must be an array")?;
                return Ok(TrayMenuItem::Submenu {
                    id: TrayItemId::new(id),
                    label,
                    enabled,
                    items: parse_menu_items(children, depth + 1)?,
                });
            }
            let action = match item
                .get("action")
                .and_then(Value::as_str)
                .unwrap_or("custom")
            {
                "custom" => TrayAction::Custom(id.into()),
                "focus" => TrayAction::FocusWindow(WindowKey::main()),
                "hide" => TrayAction::HideWindow(WindowKey::main()),
                "toggle" => TrayAction::ToggleWindow(WindowKey::main()),
                "quit" => TrayAction::Quit,
                _ => return Err("menu action must be custom, focus, hide, toggle, or quit".into()),
            };
            Ok(TrayMenuItem::Action {
                id: TrayItemId::new(id),
                label,
                enabled,
                action,
            })
        })
        .collect()
}

/// Sends one native request and converts its completion to a service result.
/// `sender` reaches the UI thread and `build` inserts the reply channel.
fn dispatch(
    sender: &Sender<NativeHostApplicationRequest>,
    build: impl FnOnce(Sender<Result<(), String>>) -> NativeHostApplicationRequest,
) -> ServiceOutcome {
    let (reply, result) = mpsc::channel();
    if sender.send(build(reply)).is_err() {
        return ServiceOutcome::Error("native application runtime has stopped".into());
    }
    match result.recv_timeout(Duration::from_secs(30)) {
        Ok(Ok(())) => ServiceOutcome::Ok(Value::Null),
        Ok(Err(error)) => ServiceOutcome::Error(error),
        Err(_) => ServiceOutcome::Error("native application request timed out".into()),
    }
}

/// Converts tray and shortcut activations and asynchronous failures to TSX events.
/// `event` is emitted by the native application runtime; unrelated events return `None`.
pub(crate) fn runtime_service_event(event: &RuntimeEvent) -> Option<ServiceResponse> {
    let target = match event {
        RuntimeEvent::Window { window, .. } => window.as_str(),
        RuntimeEvent::GlobalShortcut(event)
            if event.id.as_str().starts_with("teleprompter.")
                && event.id.as_str() != "teleprompter.toggleVisibility" =>
        {
            "teleprompter"
        }
        _ => "main",
    };
    let value = match event {
        RuntimeEvent::Window {
            window,
            event: WindowRuntimeEvent::Platform(PlatformEvent::Moved { x, y }),
        } => NativeEvent::WindowMoved {
            window: window.as_str().into(),
            x: *x,
            y: *y,
        },
        RuntimeEvent::Window {
            event: WindowRuntimeEvent::Platform(PlatformEvent::PreferencesChanged(preferences)),
            ..
        } => NativeEvent::SystemScheme {
            scheme: match preferences.color_scheme.value {
                argui_core::ColorScheme::Light => "light",
                argui_core::ColorScheme::Dark => "dark",
            }
            .into(),
        },
        RuntimeEvent::Window {
            window,
            event: WindowRuntimeEvent::Platform(PlatformEvent::Resized { width, height }),
        } => NativeEvent::WindowResized {
            window: window.as_str().into(),
            physical_width: Some(*width),
            physical_height: Some(*height),
            scale_factor: None,
        },
        RuntimeEvent::Window {
            window,
            event: WindowRuntimeEvent::Platform(PlatformEvent::ScaleFactorChanged(scale)),
        } => NativeEvent::WindowResized {
            window: window.as_str().into(),
            physical_width: None,
            physical_height: None,
            scale_factor: Some(*scale),
        },
        RuntimeEvent::Window {
            window,
            event: WindowRuntimeEvent::Platform(PlatformEvent::VisibilityChanged(visible)),
        } => NativeEvent::WindowVisibility {
            window: window.as_str().into(),
            visible: *visible,
        },
        RuntimeEvent::Tray(TrayEvent::Action {
            id,
            action: TrayAction::Custom(_),
        }) => NativeEvent::Menu {
            id: id.as_str().into(),
        },
        RuntimeEvent::GlobalShortcut(event) => NativeEvent::Shortcut {
            id: event.id.as_str().into(),
            state: if event.state == GlobalShortcutState::Pressed {
                ShortcutState::Pressed
            } else {
                ShortcutState::Released
            },
        },
        RuntimeEvent::GlobalShortcutsFailed(message) => NativeEvent::ShortcutError {
            message: message.clone(),
        },
        RuntimeEvent::TrayFailed(message) => NativeEvent::TrayError {
            message: message.clone(),
        },
        RuntimeEvent::Window {
            window,
            event: WindowRuntimeEvent::DesktopBackdropUnavailable(message),
        } => NativeEvent::WindowAppearanceError {
            window: window.as_str().into(),
            message: message.clone(),
        },
        _ => return None,
    };
    Some(ServiceResponse {
        session: u32::MAX,
        window: target.into(),
        request_id: 0,
        outcome: ServiceOutcome::Event(
            crate::json::encode(&value)
                .map_err(|error| eprintln!("Beam window event: {error}"))
                .ok()?,
        ),
    })
}
