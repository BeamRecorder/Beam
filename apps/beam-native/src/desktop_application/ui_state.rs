//! Presentation state shared by the independent native Solid scenes.

use super::types::{NativeEvent, NativeUiState, UiAction, UiActionRequest, UiStatePatch};
use crate::{
    json,
    services::{ServiceOutcome, ServiceRegistry, ServiceResponse},
};
use std::sync::{Arc, Mutex, mpsc::Sender};

pub(crate) fn register_ui_state_services(
    registry: &ServiceRegistry,
    events: Sender<ServiceResponse>,
) {
    let state = Arc::new(Mutex::new(NativeUiState::default()));
    let read = Arc::clone(&state);
    registry.register("beamUi", "state", move |_| {
        json::respond(Ok(read
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .clone()))
    });
    let state_events = events.clone();
    registry.register("beamUi", "update", move |payload| {
        json::respond((|| {
            let patch: UiStatePatch = json::decode(payload)?;
            if patch.remaining.is_some_and(|seconds| seconds > 30)
                || patch.shortcut.as_ref().is_some_and(|key| key.len() > 80)
            {
                return Err("invalid beam UI state".into());
            }
            let mut current = state.lock().unwrap_or_else(|poison| poison.into_inner());
            if let Some(value) = patch.remaining {
                current.remaining = value;
            }
            if let Some(value) = patch.shortcut {
                current.shortcut = value;
            }
            if let Some(value) = patch.paused {
                current.paused = value;
            }
            if let Some(value) = patch.busy {
                current.busy = value;
            }
            if let Some(value) = patch.region_revision {
                current.region_revision = value;
            }
            for window in ["region", "countdown", "recorder"] {
                send_event(
                    &state_events,
                    window,
                    NativeEvent::BeamUiState {
                        value: current.clone(),
                    },
                )?;
            }
            Ok(())
        })())
    });
    registry.register("beamUi", "emit", move |payload| {
        json::respond((|| {
            let request: UiActionRequest = json::decode(payload)?;
            if matches!(
                request.action,
                UiAction::WindowSelected | UiAction::WindowCanceled
            ) {
                return Err("window selection belongs to the native picker".into());
            }
            if request.action == UiAction::RegionSelected {
                let bounds = request
                    .region
                    .as_ref()
                    .ok_or("region selection requires bounds")?;
                if [bounds.x, bounds.y, bounds.width, bounds.height]
                    .into_iter()
                    .any(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
                    || bounds.width <= 0.0
                    || bounds.height <= 0.0
                    || bounds.x + bounds.width > 1.0
                    || bounds.y + bounds.height > 1.0
                {
                    return Err("invalid normalized region bounds".into());
                }
            }
            send_event(
                &events,
                "main",
                NativeEvent::BeamUi {
                    action: request.action,
                    region: request.region,
                    source_id: None,
                },
            )
        })())
    });
}

pub(super) fn send_event(
    events: &Sender<ServiceResponse>,
    window: &str,
    value: NativeEvent,
) -> Result<(), String> {
    events
        .send(ServiceResponse {
            session: u32::MAX,
            window: window.into(),
            request_id: 0,
            outcome: ServiceOutcome::Event(json::encode(&value)?),
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "../../test/desktop_application/ui_state.rs"]
mod tests;
