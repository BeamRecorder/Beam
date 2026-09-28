//! Live native window services for Beam.

use std::collections::HashMap;
use std::sync::{
    Arc,
    atomic::Ordering,
    mpsc::{self, Sender},
};
use std::time::{Duration, Instant};

use super::window_types::{ElementBounds, MonitorInfo, WindowCapabilities, WindowInfo};
use crate::json;
use argui_core::{Point, Rect, Size};
use argui_platform::{
    ResizeDirection, WindowBackend, WindowInputRegion, WindowKey, WindowLevel, WindowSpec,
};
use argui_runtime::{NativeHostApplicationRequest, NativeWindowInfo};
use serde_json::Value;

use super::dispatch;
use crate::runner::WindowGate;
use crate::services::{ServiceOutcome, ServiceRegistry};

/// Registers lazy creation for the fixed set of auxiliary Beam windows.
pub(crate) fn register_auxiliary_windows(
    registry: &Arc<ServiceRegistry>,
    sender: Sender<NativeHostApplicationRequest>,
    specs: Vec<WindowSpec>,
    gates: &HashMap<String, Arc<WindowGate>>,
) {
    let gates = gates.clone();
    let actors = Arc::downgrade(registry);
    registry.register("windows", "ensureAuxiliary", move |payload| {
        let Some(key) = payload.get("window").and_then(Value::as_str) else {
            return ServiceOutcome::Error("auxiliary window key is required".into());
        };
        let Some(spec) = specs.iter().find(|spec| spec.key.as_str() == key) else {
            return ServiceOutcome::Error("unknown auxiliary window".into());
        };
        let Some(gate) = gates.get(key) else {
            return ServiceOutcome::Error("auxiliary window gate is unavailable".into());
        };
        let _opening = gate
            .opening
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if !gate.opened.load(Ordering::Acquire) {
            let outcome = dispatch(&sender, |reply| {
                NativeHostApplicationRequest::OpenWindow(spec.clone(), reply)
            });
            if !matches!(outcome, ServiceOutcome::Ok(_)) {
                return outcome;
            }
            gate.opened.store(true, Ordering::Release);
            if let Some(actors) = actors.upgrade() {
                actors.wake_window(key);
            }
        }
        let deadline = Instant::now() + Duration::from_secs(10);
        while !gate.mounted.load(Ordering::Acquire) {
            if let Some(error) = gate
                .failure
                .lock()
                .unwrap_or_else(|poison| poison.into_inner())
                .as_ref()
            {
                return ServiceOutcome::Error(error.clone());
            }
            if Instant::now() >= deadline {
                return ServiceOutcome::Error(format!("{key} native scene did not mount"));
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        ServiceOutcome::Ok(Value::Null)
    });
}

/// Registers inspection, visibility, positioning, and sizing services.
pub(super) fn register_window_services(
    registry: &ServiceRegistry,
    sender: Sender<NativeHostApplicationRequest>,
) {
    let info_sender = sender.clone();
    let measure_sender = sender.clone();
    registry.register("windows", "measure", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let Some(element) = payload
            .get("element")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.len() <= 256)
        else {
            return ServiceOutcome::Error("element ID is required".into());
        };
        let (reply, result) = mpsc::channel();
        if measure_sender
            .send(NativeHostApplicationRequest::GetElementBounds(
                key,
                element.into(),
                reply,
            ))
            .is_err()
        {
            return ServiceOutcome::Error("native application runtime has stopped".into());
        }
        match result.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(rect)) => json::respond(Ok(ElementBounds {
                width: rect.size.width,
                height: rect.size.height,
            })),
            Ok(Err(error)) => ServiceOutcome::Error(error),
            Err(_) => ServiceOutcome::Error("layout measurement timed out".into()),
        }
    });
    registry.register("windows", "getInfo", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let (reply, result) = mpsc::channel();
        if info_sender
            .send(NativeHostApplicationRequest::GetWindowInfo(key, reply))
            .is_err()
        {
            return ServiceOutcome::Error("native application runtime has stopped".into());
        }
        match result.recv_timeout(Duration::from_secs(30)) {
            Ok(Ok(info)) => json::respond(Ok(window_info(info))),
            Ok(Err(error)) => ServiceOutcome::Error(error),
            Err(_) => ServiceOutcome::Error("window information request timed out".into()),
        }
    });
    let monitor_sender = sender.clone();
    registry.register("windows", "getMonitors", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let (reply, result) = mpsc::channel();
        if monitor_sender
            .send(NativeHostApplicationRequest::GetMonitors(key, reply))
            .is_err()
        {
            return ServiceOutcome::Error("native application runtime has stopped".into());
        }
        match result.recv_timeout(Duration::from_secs(30)) {
            Ok(Ok(monitors)) => json::respond(Ok(monitors
                .into_iter()
                .map(|monitor| MonitorInfo {
                    name: monitor.name,
                    x: monitor.x,
                    y: monitor.y,
                    width: monitor.width,
                    height: monitor.height,
                    scale_factor: monitor.scale_factor,
                    primary: monitor.primary,
                })
                .collect::<Vec<_>>())),
            Ok(Err(error)) => ServiceOutcome::Error(error),
            Err(_) => ServiceOutcome::Error("monitor information request timed out".into()),
        }
    });
    let input_sender = sender.clone();
    registry.register("windows", "setInputRegion", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let region = match parse_input_region(&payload) {
            Ok(region) => region,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dispatch(&input_sender, |reply| {
            NativeHostApplicationRequest::SetWindowInputRegion(key, region, reply)
        })
    });
    let level_sender = sender.clone();
    registry.register("windows", "setLevel", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let level = match payload.get("level").and_then(Value::as_str) {
            Some("bottom") => WindowLevel::AlwaysOnBottom,
            Some("normal") => WindowLevel::Normal,
            Some("top") => WindowLevel::AlwaysOnTop,
            _ => {
                return ServiceOutcome::Error("window level must be bottom, normal, or top".into());
            }
        };
        dispatch(&level_sender, |reply| {
            NativeHostApplicationRequest::SetWindowLevel(key, level, reply)
        })
    });
    let drag_sender = sender.clone();
    registry.register("windows", "drag", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dispatch(&drag_sender, |reply| {
            NativeHostApplicationRequest::DragWindow(key, reply)
        })
    });
    let minimize_sender = sender.clone();
    let resize_sender = sender.clone();
    registry.register("windows", "resize", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let direction = match payload.get("direction").and_then(Value::as_str) {
            Some("north") => ResizeDirection::North,
            Some("northEast") => ResizeDirection::NorthEast,
            Some("east") => ResizeDirection::East,
            Some("southEast") => ResizeDirection::SouthEast,
            Some("south") => ResizeDirection::South,
            Some("southWest") => ResizeDirection::SouthWest,
            Some("west") => ResizeDirection::West,
            Some("northWest") => ResizeDirection::NorthWest,
            _ => return ServiceOutcome::Error("invalid resize direction".into()),
        };
        dispatch(&resize_sender, |reply| {
            NativeHostApplicationRequest::ResizeWindow(key, direction, reply)
        })
    });
    registry.register("windows", "minimize", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dispatch(&minimize_sender, |reply| {
            NativeHostApplicationRequest::MinimizeWindow(key, reply)
        })
    });
    let focus_sender = sender.clone();
    registry.register("windows", "focusNamed", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dispatch(&focus_sender, |reply| {
            NativeHostApplicationRequest::FocusNamedWindow(key, reply)
        })
    });
    let show_sender = sender.clone();
    registry.register("windows", "show", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dispatch(&show_sender, |reply| {
            NativeHostApplicationRequest::ShowWindow(key, reply)
        })
    });
    let hide_sender = sender.clone();
    registry.register("windows", "hide", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dispatch(&hide_sender, |reply| {
            NativeHostApplicationRequest::HideWindow(key, reply)
        })
    });
    let close_sender = sender.clone();
    registry.register("windows", "close", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dispatch(&close_sender, |reply| {
            NativeHostApplicationRequest::CloseWindow(key, reply)
        })
    });
    let title_sender = sender.clone();
    registry.register("windows", "setTitle", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let Some(title) = payload
            .get("title")
            .and_then(Value::as_str)
            .filter(|title| title.len() <= 256)
        else {
            return ServiceOutcome::Error(
                "window title must be a string of at most 256 bytes".into(),
            );
        };
        dispatch(&title_sender, |reply| {
            NativeHostApplicationRequest::SetWindowTitle(key, title.into(), reply)
        })
    });
    let size_sender = sender.clone();
    registry.register("windows", "setSize", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let (Some(width), Some(height)) = (
            payload.get("width").and_then(Value::as_f64),
            payload.get("height").and_then(Value::as_f64),
        ) else {
            return ServiceOutcome::Error("window size requires numeric width and height".into());
        };
        dispatch(&size_sender, |reply| {
            NativeHostApplicationRequest::SetWindowSize(key, width, height, reply)
        })
    });
    let position_sender = sender.clone();
    registry.register("windows", "setPosition", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let (Some(x), Some(y)) = (
            payload.get("x").and_then(Value::as_f64),
            payload.get("y").and_then(Value::as_f64),
        ) else {
            return ServiceOutcome::Error("window position requires numeric x and y".into());
        };
        if !x.is_finite() || !y.is_finite() || x.abs() > 100_000.0 || y.abs() > 100_000.0 {
            return ServiceOutcome::Error("window position is out of bounds".into());
        }
        dispatch(&position_sender, |reply| {
            NativeHostApplicationRequest::SetWindowPhysicalPosition(
                key,
                x.round() as i32,
                y.round() as i32,
                reply,
            )
        })
    });
    registry.register("windows", "setDecorations", move |payload| {
        let key = match window_key(&payload) {
            Ok(key) => key,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let Some(decorations) = payload.get("decorations").and_then(Value::as_bool) else {
            return ServiceOutcome::Error("window decorations must be a boolean".into());
        };
        dispatch(&sender, |reply| {
            NativeHostApplicationRequest::SetWindowDecorations(key, decorations, reply)
        })
    });
}

/// Resolves the target window key from a service payload.
/// `payload.window` defaults to the main window.
///
/// # Errors
/// Returns an error for an empty or non-string window key.
fn window_key(payload: &Value) -> Result<WindowKey, String> {
    match payload.get("window") {
        None => Ok(WindowKey::main()),
        Some(Value::String(value)) if !value.is_empty() => Ok(WindowKey::new(value)),
        _ => Err("window must be a nonempty string".into()),
    }
}

/// Converts native logical window information to the JavaScript service response.
/// `info` contains the latest title, dimensions, visibility, and appearance state.
fn window_info(info: NativeWindowInfo) -> WindowInfo {
    let backend = match info.capabilities.backend {
        WindowBackend::Windows => "windows",
        WindowBackend::MacOs => "macos",
        WindowBackend::X11 => "x11",
        WindowBackend::Wayland => "wayland",
        WindowBackend::Android => "android",
        WindowBackend::Ios => "ios",
        WindowBackend::Web => "web",
        WindowBackend::Other => "other",
    };
    WindowInfo {
        window: info.window.as_str().into(),
        title: info.title,
        width: info.width,
        height: info.height,
        visible: info.visible,
        x: info.x.map(|x| (x * info.scale_factor).round()),
        y: info.y.map(|y| (y * info.scale_factor).round()),
        decorations: info.decorations,
        transparent: info.transparent,
        backdrop: info.backdrop.is_some(),
        backdrop_available: info.backdrop_available,
        scale_factor: info.scale_factor,
        ui_zoom_factor: info.ui_zoom_factor,
        capabilities: WindowCapabilities {
            backend,
            absolute_position: info.capabilities.absolute_position,
            window_level: info.capabilities.window_level,
            mouse_passthrough: info.capabilities.mouse_passthrough,
            input_regions: info.capabilities.input_regions,
            transparent_compositing: info.capabilities.transparent_compositing,
            native_shadow: info.capabilities.native_shadow,
        },
    }
}

/// Parses one TSX input policy with a rectangular hole in UI coordinates.
/// `payload` contains `mode` and, for exclusion, a finite nonnegative `rect`.
///
/// # Errors
/// Returns a validation message for missing or invalid fields.
fn parse_input_region(payload: &Value) -> Result<WindowInputRegion, String> {
    match payload.get("mode").and_then(Value::as_str) {
        Some("full") => Ok(WindowInputRegion::Full),
        Some("passThrough") => Ok(WindowInputRegion::PassThrough),
        Some("exclude") => {
            let rect = payload
                .get("rect")
                .ok_or("exclude input region requires rect")?;
            let field = |name| -> Result<f32, String> {
                let value = rect
                    .get(name)
                    .and_then(Value::as_f64)
                    .ok_or_else(|| format!("input region {name} must be numeric"))?;
                if !value.is_finite() || value.abs() > 100_000.0 {
                    return Err(format!(
                        "input region {name} is outside the supported range"
                    ));
                }
                Ok(value as f32)
            };
            let (x, y, width, height) =
                (field("x")?, field("y")?, field("width")?, field("height")?);
            if width < 0.0 || height < 0.0 {
                return Err("input region width and height must be nonnegative".into());
            }
            Ok(WindowInputRegion::Exclude(Rect::new(
                Point::new(x, y),
                Size::new(width, height),
            )))
        }
        _ => Err("input region mode must be full, passThrough, or exclude".into()),
    }
}
