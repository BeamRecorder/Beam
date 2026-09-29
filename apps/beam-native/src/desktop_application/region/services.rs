//! Typed services for opening the native spotlight and controlling its crop.

use super::{
    capture::{monitor_for_window, screen_pixels},
    types::{ColorsRequest, PresentRequest, PresetRequest, RegionMessage, RegionState},
};
use crate::{ServiceRegistry, json};
use argui_core::{Color, Size};
use argui_platform::{
    CloseBehavior, WindowBackend, WindowConfig, WindowInputRegion, WindowKey, WindowLevel,
    WindowSpec,
};
use argui_runtime::{NativeHostApplicationRequest, NativeMonitorInfo, NativeWindowInfo};
use std::{
    sync::{
        Arc, Mutex,
        mpsc::{self, Sender},
    },
    time::{Duration, Instant},
};

/// Registers native crop operations; no pointer stream crosses the service bridge.
pub(crate) fn register(
    registry: &ServiceRegistry,
    sender: Sender<NativeHostApplicationRequest>,
    state: &Arc<Mutex<RegionState>>,
) {
    let open_state = Arc::clone(state);
    let open_sender = sender.clone();
    let opening = Mutex::new(());
    registry.register("region", "open", move |_| {
        let _opening = opening.lock().unwrap_or_else(|poison| poison.into_inner());
        json::respond(open(&open_sender, &open_state))
    });
    let read = Arc::clone(state);
    registry.register("region", "state", move |_| {
        json::respond(Ok::<_, String>(
            read.lock()
                .unwrap_or_else(|poison| poison.into_inner())
                .snapshot(),
        ))
    });
    for (name, action) in [("confirm", true), ("cancel", false)] {
        let sender = sender.clone();
        registry.register("region", name, move |_| {
            json::respond(message(
                &sender,
                if action {
                    RegionMessage::Confirm
                } else {
                    RegionMessage::Cancel
                },
            ))
        });
    }
    let preset_sender = sender.clone();
    registry.register("region", "preset", move |payload| {
        json::respond((|| {
            let request: PresetRequest = json::decode(payload)?;
            if ![
                "free",
                "16:9",
                "16:10",
                "4:3",
                "3:2",
                "5:4",
                "1:1",
                "21:9",
                "32:9",
                "9:16",
                "2:3",
                "3:4",
                "4:5",
                "3840×2160",
                "2560×1440",
                "2560×1080",
                "1920×1080",
                "1920×1200",
                "1600×900",
                "1440×900",
                "1366×768",
                "1280×720",
                "1024×768",
                "1080×1920",
                "1080×1350",
                "1080×1080",
                "720×1280",
            ]
            .contains(&request.value.as_str())
            {
                return Err("unknown region preset".into());
            }
            message(
                &preset_sender,
                RegionMessage::Preset {
                    value: request.value,
                },
            )
        })())
    });
    let colors_sender = sender.clone();
    let colors_state = Arc::clone(state);
    registry.register("region", "colors", move |payload| {
        json::respond((|| {
            let request: ColorsRequest = json::decode(payload)?;
            if request
                .instruction
                .as_ref()
                .is_some_and(|value| value.len() > 1024)
            {
                return Err("region instruction is too long".into());
            }
            let border = Color::from_hex(&request.border).map_err(|error| error.to_string())?;
            let accent = Color::from_hex(&request.accent).map_err(|error| error.to_string())?;
            let surface = Color::from_hex(&request.surface).map_err(|error| error.to_string())?;
            let foreground =
                Color::from_hex(&request.foreground).map_err(|error| error.to_string())?;
            let dim = Color::from_hex(&request.dim).map_err(|error| error.to_string())?;
            let created = {
                let mut state = colors_state
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                state.border = border;
                state.accent = accent;
                state.surface = surface;
                state.foreground = foreground;
                state.dim = dim;
                if let Some(instruction) = request.instruction {
                    state.instruction = instruction;
                }
                state.created
            };
            if created {
                message(&colors_sender, RegionMessage::Refresh)?;
            }
            Ok::<_, String>(())
        })())
    });
    let present_state = Arc::clone(state);
    let presenting = Mutex::new(());
    registry.register("region", "present", move |payload| {
        let _presenting = presenting
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        json::respond((|| {
            let request: PresentRequest = json::decode(payload)?;
            let snapshot = present_state
                .lock()
                .unwrap_or_else(|poison| poison.into_inner())
                .snapshot();
            if !snapshot.open || snapshot.dragging || snapshot.revision != request.revision {
                return Ok(());
            }
            let preferences = crate::beam::initial_preferences()?;
            let saved = preferences.window_positions.get("regionActions");
            let (actions_x, actions_y) =
                saved.map_or((snapshot.actions_x, snapshot.actions_y), |position| {
                    let state = present_state
                        .lock()
                        .unwrap_or_else(|poison| poison.into_inner());
                    let Some(monitor) = &state.monitor else {
                        return (snapshot.actions_x, snapshot.actions_y);
                    };
                    let width = (snapshot.actions_width * state.pixel_scale).round() as i32;
                    let height = (snapshot.actions_height * state.pixel_scale).round() as i32;
                    (
                        (position.x as i32)
                            .clamp(monitor.x, monitor.x + (monitor.width as i32 - width).max(0)),
                        (position.y as i32).clamp(
                            monitor.y,
                            monitor.y + (monitor.height as i32 - height).max(0),
                        ),
                    )
                });
            for (name, x, y, width, height) in [
                snapshot.selected.then_some((
                    "regionControls",
                    snapshot.controls_x,
                    snapshot.controls_y,
                    snapshot.controls_width,
                    snapshot.controls_height,
                )),
                Some((
                    "regionActions",
                    actions_x,
                    actions_y,
                    snapshot.actions_width,
                    snapshot.actions_height,
                )),
            ]
            .into_iter()
            .flatten()
            {
                let key = WindowKey::new(name);
                // Dragging already hides these surfaces. Presets only reposition
                // retained controls so the compositor does not replay their entrance.
                query(&sender, |reply| {
                    NativeHostApplicationRequest::SetWindowPhysicalPosition(
                        key.clone(),
                        x,
                        y,
                        reply,
                    )
                })?;
                query(&sender, |reply| {
                    NativeHostApplicationRequest::SetWindowSize(key.clone(), width, height, reply)
                })?;
                let deadline = Instant::now() + Duration::from_secs(2);
                loop {
                    let info: NativeWindowInfo = query(&sender, |reply| {
                        NativeHostApplicationRequest::GetWindowInfo(key.clone(), reply)
                    })?;
                    let placed = info.x.zip(info.y).is_some_and(|(actual_x, actual_y)| {
                        (actual_x * info.scale_factor).round() as i32 == x
                            && (actual_y * info.scale_factor).round() as i32 == y
                    });
                    let sized =
                        (info.width - width).abs() < 1.0 && (info.height - height).abs() < 1.0;
                    let current = present_state
                        .lock()
                        .unwrap_or_else(|poison| poison.into_inner())
                        .snapshot();
                    if current.revision != request.revision || !current.open || current.dragging {
                        return Ok(());
                    }
                    if placed && sized {
                        break;
                    }
                    if Instant::now() >= deadline {
                        return Err(format!("The window manager did not place {name}."));
                    }
                    std::thread::sleep(Duration::from_millis(8));
                }
            }
            message(
                &sender,
                RegionMessage::Present {
                    revision: request.revision,
                },
            )
        })())
    });
}

/// Opens at monitor dimensions before painting, using the gallery's X11 ordering.
fn open(
    sender: &Sender<NativeHostApplicationRequest>,
    state: &Mutex<RegionState>,
) -> Result<(), String> {
    let info: NativeWindowInfo = query(sender, |reply| {
        NativeHostApplicationRequest::GetWindowInfo(WindowKey::main(), reply)
    })?;
    let capabilities = info.capabilities;
    if !capabilities.absolute_position
        || !capabilities.window_level
        || !capabilities.transparent_compositing
    {
        return Err(
            "region selection requires transparent, positioned windows with an always-on-top level"
                .into(),
        );
    }
    if capabilities.backend == WindowBackend::Wayland {
        return Err("run the Linux region overlay with the X11 window backend".into());
    }
    if capabilities.backend == WindowBackend::X11 && !capabilities.input_regions {
        return Err("the X11 region overlay requires native input-region support".into());
    }
    let monitors: Vec<NativeMonitorInfo> = query(sender, |reply| {
        NativeHostApplicationRequest::GetMonitors(WindowKey::main(), reply)
    })?;
    let monitor = monitor_for_window(&info, &monitors).ok_or("no native monitor is available")?;
    if monitor.width == 0
        || monitor.height == 0
        || !monitor.scale_factor.is_finite()
        || monitor.scale_factor <= 0.0
    {
        return Err("The native monitor has invalid pixel geometry.".into());
    }
    let capture = screen_pixels(monitor, &monitors)?;
    let monitor = &capture.monitor;
    let width = f64::from(monitor.width) / monitor.scale_factor;
    let height = f64::from(monitor.height) / monitor.scale_factor;
    let created = {
        let mut state = state.lock().unwrap_or_else(|poison| poison.into_inner());
        state.monitor = Some(monitor.clone());
        state.viewport = Size::new(
            (width / f64::from(info.ui_zoom_factor)) as f32,
            (height / f64::from(info.ui_zoom_factor)) as f32,
        );
        state.pixel_scale = monitor.scale_factor * f64::from(info.ui_zoom_factor);
        state.input_holes = capabilities.input_regions;
        state.crop = None;
        state.drag = None;
        state.magnifier = None;
        state.pixels = Some(capture.pixels);
        state.source_id = Some(capture.source_id);
        state.open = true;
        state.passive = false;
        state.revision += 1;
        state.created
    };
    let key = WindowKey::new("region");
    if created {
        query(sender, |reply| {
            NativeHostApplicationRequest::SetWindowSize(key.clone(), width, height, reply)
        })?;
        query(sender, |reply| {
            NativeHostApplicationRequest::SetWindowPhysicalPosition(
                key.clone(),
                monitor.x,
                monitor.y,
                reply,
            )
        })?;
    } else {
        let mut spec = WindowSpec::new(
            key.clone(),
            WindowConfig {
                title: "Beam Region".into(),
                width,
                height,
                physical_position: Some((monitor.x, monitor.y)),
                decorations: false,
                resizable: false,
                transparent: true,
                native_shadow: false,
                level: WindowLevel::AlwaysOnTop,
                skip_taskbar: true,
                focus_on_launch: false,
                close_behavior: CloseBehavior::Hide,
                ..WindowConfig::default()
            },
        );
        spec.visible = false;
        query(sender, |reply| {
            NativeHostApplicationRequest::OpenWindow(spec, reply)
        })?;
        state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .created = true;
    }
    // The actual window DPI may differ from a monitor's advertised DPI on X11.
    // Pointer events and the loupe must share the runtime's physical/UI scale.
    let native: NativeWindowInfo = query(sender, |reply| {
        NativeHostApplicationRequest::GetWindowInfo(key.clone(), reply)
    })?;
    let scale = native.scale_factor * f64::from(native.ui_zoom_factor);
    if !scale.is_finite() || scale <= 0.0 {
        return Err("The region window has invalid DPI.".into());
    }
    query(sender, |reply| {
        NativeHostApplicationRequest::SetWindowSize(
            key.clone(),
            f64::from(monitor.width) / native.scale_factor,
            f64::from(monitor.height) / native.scale_factor,
            reply,
        )
    })?;
    {
        let mut state = state.lock().unwrap_or_else(|poison| poison.into_inner());
        state.pixel_scale = scale;
        state.viewport = Size::new(
            (f64::from(monitor.width) / scale) as f32,
            (f64::from(monitor.height) / scale) as f32,
        );
        state.revision += 1;
    }
    query(sender, |reply| {
        NativeHostApplicationRequest::SetWindowInputRegion(
            key.clone(),
            WindowInputRegion::Full,
            reply,
        )
    })?;
    query(sender, |reply| {
        NativeHostApplicationRequest::ShowWindow(key.clone(), reply)
    })?;
    query(sender, |reply| {
        NativeHostApplicationRequest::FocusNamedWindow(key, reply)
    })?;
    message(sender, RegionMessage::Refresh)
}

/// Sends a typed model message after releasing shared state locks.
fn message(
    sender: &Sender<NativeHostApplicationRequest>,
    message: RegionMessage,
) -> Result<(), String> {
    let message = json::stringify(&message)?;
    query(sender, |reply| {
        NativeHostApplicationRequest::SendWindowMessage(WindowKey::new("region"), message, reply)
    })
}

/// Waits for one UI-thread operation and preserves native errors for the caller.
fn query<T>(
    sender: &Sender<NativeHostApplicationRequest>,
    build: impl FnOnce(Sender<Result<T, String>>) -> NativeHostApplicationRequest,
) -> Result<T, String> {
    let (reply, result) = mpsc::channel();
    sender
        .send(build(reply))
        .map_err(|_| "native application runtime has stopped")?;
    result
        .recv_timeout(Duration::from_secs(30))
        .map_err(|_| "native region request timed out")?
}
