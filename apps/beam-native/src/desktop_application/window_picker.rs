//! Window selection, real thumbnails, foreground preview, and cancel restoration.

use super::dispatch;
use super::{
    types::{AssetReference, NativeEvent, UiAction, WindowChoice},
    ui_state::send_event,
};
use crate::json;
use crate::services::{ServiceOutcome, ServiceRegistry, ServiceResponse};
use argui_paint::{ImageAsset, ImageId};
use argui_platform::{WindowInputRegion, WindowKey};
use argui_runtime::NativeHostApplicationRequest;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use beam_screen::{
    desktop,
    model::{SourceId, SourceKind},
    screen::capture_source_preview,
};
use serde_json::Value;
use std::sync::{
    Arc, Mutex,
    mpsc::{self, Sender},
};
use std::time::Duration;

use super::window_types::PickerState;

/// Registers the bounded picker services used by its independent Solid scene.
pub(crate) fn register_window_picker_services(
    registry: &ServiceRegistry,
    sender: Sender<NativeHostApplicationRequest>,
    events: Sender<ServiceResponse>,
) {
    let state = Arc::new(Mutex::new(PickerState::default()));
    let open_state = Arc::clone(&state);
    let open_sender = sender.clone();
    let open_events = events.clone();
    registry.register("windowPicker", "open", move |monitor| {
        result((|| {
            let mut current = open_state
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            let generation = current
                .generation
                .checked_add(1)
                .ok_or("window picker generation exhausted")?;
            let sources = beam_screen::list_sources().map_err(|error| error.to_string())?;
            let choices = sources
                .into_iter()
                .filter(|source| {
                    source.kind == SourceKind::Window && !source.id.as_str().starts_with("portal:")
                })
                .filter_map(|source| {
                    desktop::window_bounds(&source.id)
                        .ok()
                        .map(|bounds| WindowChoice {
                            generation,
                            id: source.id.to_string(),
                            label: source.label,
                            x: bounds.x,
                            y: bounds.y,
                            width: bounds.width,
                            height: bounds.height,
                        })
                })
                .collect::<Vec<_>>();
            if choices.len() > 256 {
                return Err("Window selection supports at most 256 open windows.".into());
            }
            #[cfg(target_os = "linux")]
            let stack = beam_screen::screen::linux::x11::window_stack()
                .map_err(|error| error.to_string())?;
            #[cfg(not(target_os = "linux"))]
            let stack = Vec::new();
            current.generation = generation;
            current.choices = choices;
            current.previous_stack = stack;
            current.open = true;
            let scale = number(&monitor, "scaleFactor")?;
            let width = (number(&monitor, "width")? / scale - 64.0).clamp(360.0, 960.0);
            let height = 252.0;
            let x = number(&monitor, "x")? + (number(&monitor, "width")? - width * scale) / 2.0;
            let y = number(&monitor, "y")? + number(&monitor, "height")? - (height + 32.0) * scale;
            require(dispatch(&open_sender, |reply| {
                NativeHostApplicationRequest::SetWindowSize(
                    WindowKey::new("windowPicker"),
                    width,
                    height,
                    reply,
                )
            }))?;
            require(dispatch(&open_sender, |reply| {
                NativeHostApplicationRequest::SetWindowPhysicalPosition(
                    WindowKey::new("windowPicker"),
                    x.round() as i32,
                    y.round() as i32,
                    reply,
                )
            }))?;
            require(dispatch(&open_sender, |reply| {
                NativeHostApplicationRequest::SetWindowInputRegion(
                    WindowKey::new("windowHighlight"),
                    WindowInputRegion::PassThrough,
                    reply,
                )
            }))?;
            send_event(
                &open_events,
                "windowPicker",
                NativeEvent::WindowPickerOpened,
            )?;
            require(dispatch(&open_sender, |reply| {
                NativeHostApplicationRequest::FocusNamedWindow(
                    WindowKey::new("windowPicker"),
                    reply,
                )
            }))?;
            Ok(Value::Null)
        })())
    });
    let choices_state = Arc::clone(&state);
    registry.register("windowPicker", "choices", move |_| {
        json::respond(Ok(&choices_state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .choices))
    });
    let thumbnail_state = Arc::clone(&state);
    let thumbnail_sender = sender.clone();
    registry.register("windowPicker", "thumbnail", move |payload| {
        result((|| {
            let (id, index) = {
                let current = thumbnail_state
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                let id = selected_id(&payload, &current)?;
                let index = current
                    .choices
                    .iter()
                    .position(|choice| choice.id == id.as_str())
                    .ok_or("window is no longer selectable")?;
                (id, index)
            };
            let preview =
                capture_source_preview(&id, 320, 180).map_err(|error| error.to_string())?;
            let encoded = preview
                .thumbnail
                .strip_prefix("data:image/jpeg;base64,")
                .ok_or("invalid native thumbnail format")?;
            let bytes = STANDARD
                .decode(encoded)
                .map_err(|error| error.to_string())?;
            let raster = image::load_from_memory(&bytes)
                .map_err(|error| error.to_string())?
                .into_rgba8();
            // Publication is generation-checked below; reuse a bounded asset pool.
            let image_id = (1_u64 << 40) + index as u64;
            let image = ImageAsset::rgba8(
                ImageId(image_id),
                raster.width(),
                raster.height(),
                raster.into_raw(),
            )
            .map_err(|error| error.to_string())?;
            let current = thumbnail_state
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            selected_id(&payload, &current)?;
            require(dispatch(&thumbnail_sender, |reply| {
                NativeHostApplicationRequest::RegisterWindowImage(
                    WindowKey::new("windowPicker"),
                    image,
                    reply,
                )
            }))?;
            json::encode(&AssetReference::Image { id: image_id })
        })())
    });
    let preview_state = Arc::clone(&state);
    let preview_sender = sender.clone();
    registry.register("windowPicker", "preview", move |payload| {
        result((|| {
            let current = preview_state
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            let id = selected_id(&payload, &current)?;
            desktop::raise_window(&id).map_err(|error| error.to_string())?;
            let bounds = desktop::window_bounds(&id).map_err(|error| error.to_string())?;
            let (reply, response) = mpsc::channel();
            preview_sender
                .send(NativeHostApplicationRequest::GetWindowInfo(
                    WindowKey::new("windowHighlight"),
                    reply,
                ))
                .map_err(|error| error.to_string())?;
            let info = response
                .recv_timeout(Duration::from_secs(10))
                .map_err(|error| error.to_string())??;
            let scale = info.scale_factor;
            require(dispatch(&preview_sender, |reply| {
                NativeHostApplicationRequest::SetWindowSize(
                    WindowKey::new("windowHighlight"),
                    (f64::from(bounds.width) + 6.0) / scale,
                    (f64::from(bounds.height) + 6.0) / scale,
                    reply,
                )
            }))?;
            require(dispatch(&preview_sender, |reply| {
                NativeHostApplicationRequest::SetWindowPhysicalPosition(
                    WindowKey::new("windowHighlight"),
                    bounds.x - 3,
                    bounds.y - 3,
                    reply,
                )
            }))?;
            require(dispatch(&preview_sender, |reply| {
                NativeHostApplicationRequest::ShowWindow(WindowKey::new("windowHighlight"), reply)
            }))?;
            Ok(Value::Null)
        })())
    });
    let select_state = Arc::clone(&state);
    let select_sender = sender.clone();
    let select_events = events.clone();
    registry.register("windowPicker", "select", move |payload| {
        result((|| {
            let mut current = select_state
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            let id = selected_id(&payload, &current)?;
            desktop::activate_window(&id).map_err(|error| error.to_string())?;
            hide(&select_sender)?;
            current.open = false;
            send_event(
                &select_events,
                "main",
                NativeEvent::BeamUi {
                    action: UiAction::WindowSelected,
                    region: None,
                    source_id: Some(id.to_string()),
                },
            )?;
            Ok(Value::Null)
        })())
    });
    registry.register("windowPicker", "cancel", move |_| {
        result((|| {
            let mut current = state.lock().unwrap_or_else(|poison| poison.into_inner());
            if !current.open {
                return Ok(Value::Null);
            }
            hide(&sender)?;
            current.open = false;
            #[cfg(target_os = "linux")]
            for id in &current.previous_stack {
                if let Ok(id) = SourceId::new(id) {
                    let _ = desktop::raise_window(&id);
                }
            }
            send_event(
                &events,
                "main",
                NativeEvent::BeamUi {
                    action: UiAction::WindowCanceled,
                    region: None,
                    source_id: None,
                },
            )?;
            Ok(Value::Null)
        })())
    });
}

fn selected_id(payload: &Value, current: &PickerState) -> Result<SourceId, String> {
    let id = payload
        .get("id")
        .and_then(Value::as_str)
        .ok_or("window source ID is required")?;
    if payload.get("generation").and_then(Value::as_u64) != Some(current.generation) {
        return Err("window picker request belongs to an expired selection".into());
    }
    if !current.open || !current.choices.iter().any(|choice| choice.id == id) {
        return Err("window is no longer selectable".into());
    }
    SourceId::new(id).map_err(|error| error.to_string())
}
fn number(value: &Value, key: &str) -> Result<f64, String> {
    value
        .get(key)
        .and_then(Value::as_f64)
        .filter(|number| {
            number.is_finite()
                && number.abs() <= 100_000.0
                && (key != "scaleFactor" || *number > 0.0)
        })
        .ok_or_else(|| format!("invalid monitor {key}"))
}
fn hide(sender: &Sender<NativeHostApplicationRequest>) -> Result<(), String> {
    for window in ["windowHighlight", "windowPicker"] {
        require(dispatch(sender, |reply| {
            NativeHostApplicationRequest::HideWindow(WindowKey::new(window), reply)
        }))?;
    }
    Ok(())
}
fn require(outcome: ServiceOutcome) -> Result<(), String> {
    match outcome {
        ServiceOutcome::Ok(_) => Ok(()),
        ServiceOutcome::Error(error) => Err(error),
        _ => Err("native window operation failed".into()),
    }
}
fn result(value: Result<Value, String>) -> ServiceOutcome {
    value.map_or_else(ServiceOutcome::Error, ServiceOutcome::Ok)
}
