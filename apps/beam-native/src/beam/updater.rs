//! Shared update transaction; blocking operations run on native service workers.

mod backend;
mod types;

use crate::{ServiceOutcome, ServiceRegistry, json};
use argui_updater::{CancellationToken, State, Updater};
use backend::GitHubBackend;
use beam_media_engine::{RecordingController, RecordingState};
use std::{
    sync::{Arc, Mutex, TryLockError, Weak},
    time::{Duration, Instant},
};
use types::{Action, Snapshot, UpdateEvent, UpdateSession};

/// Registers one retained transaction shared by hidden and visible settings windows.
pub(super) fn register(
    registry: &Arc<ServiceRegistry>,
    controller: RecordingController,
) -> Result<(), String> {
    let state = Arc::new(UpdateSession {
        version: super::info::application_info()?.version,
        engine: Mutex::new(None),
        snapshot: Mutex::new(Snapshot::from_state(&State::Idle)),
        cancellation: Mutex::new(None),
    });
    let read = Arc::clone(&state);
    registry.register("updates", "state", move |_| {
        json::respond(Ok::<_, String>(snapshot(&read)))
    });
    let cancel = Arc::clone(&state);
    registry.register("updates", "cancel", move |_| {
        if let Some(token) = cancel
            .cancellation
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .as_ref()
        {
            token.cancel();
        }
        json::respond(Ok::<_, String>(snapshot(&cancel)))
    });
    for (method, action) in [
        ("check", Action::Check),
        ("download", Action::Download),
        ("install", Action::Install),
    ] {
        let state = Arc::clone(&state);
        let events = Arc::downgrade(registry);
        let controller = controller.clone();
        registry.register("updates", method, move |_| {
            if matches!(action, Action::Install)
                && matches!(
                    controller.status().state,
                    RecordingState::Preparing
                        | RecordingState::Armed
                        | RecordingState::Recording
                        | RecordingState::Paused
                        | RecordingState::Finalizing
                )
            {
                return ServiceOutcome::Error(
                    "Finish the current capture before installing an update.".into(),
                );
            }
            json::respond(run(&state, &events, &action))
        });
    }
    Ok(())
}

/// Reads progress without waiting for the HTTP or installer transaction lock.
fn snapshot(state: &UpdateSession) -> Snapshot {
    state
        .snapshot
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone()
}

/// Retains progress, limiting download event delivery to twenty updates per second.
fn publish(
    state: &UpdateSession,
    events: &Weak<ServiceRegistry>,
    update: &State,
    last: &mut Option<Instant>,
) {
    let update = Snapshot::from_state(update);
    *state
        .snapshot
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = update.clone();
    if update.phase == "downloading"
        && last.is_some_and(|time| time.elapsed() < Duration::from_millis(50))
    {
        return;
    }
    *last = Some(Instant::now());
    if let Some(registry) = events.upgrade()
        && let Ok(event) = json::encode(&UpdateEvent {
            r#type: "updaterState",
            update: &update,
        })
    {
        registry.broadcast_event(&event);
    }
}

/// Serializes actions while leaving state queries and download cancellation available.
fn run(
    state: &UpdateSession,
    events: &Weak<ServiceRegistry>,
    action: &Action,
) -> Result<Snapshot, String> {
    let mut engine = match state.engine.try_lock() {
        Ok(engine) => engine,
        Err(TryLockError::Poisoned(poison)) => poison.into_inner(),
        Err(TryLockError::WouldBlock) => {
            return Err("An update operation is already running.".into());
        }
    };
    let mut last = None;
    if engine.is_none() {
        if !matches!(action, Action::Check) {
            return Err("Check for an update before downloading.".into());
        }
        match GitHubBackend::new(&state.version) {
            Ok(backend) => *engine = Some(Updater::new(backend)),
            Err(error) => {
                publish(state, events, &State::Failed(error.to_string()), &mut last);
                return Err(error.to_string());
            }
        }
    }
    let engine = engine.as_mut().ok_or("update engine is unavailable")?;
    let result = match action {
        Action::Check => engine
            .check(|update| publish(state, events, update, &mut last))
            .map(|_| ()),
        Action::Download => {
            let token = CancellationToken::default();
            *state
                .cancellation
                .lock()
                .unwrap_or_else(|poison| poison.into_inner()) = Some(token.clone());
            let result =
                engine.download(&token, |update| publish(state, events, update, &mut last));
            *state
                .cancellation
                .lock()
                .unwrap_or_else(|poison| poison.into_inner()) = None;
            result
        }
        Action::Install => engine
            .install(|update| publish(state, events, update, &mut last))
            .map(|_| ()),
    };
    result.map_err(|error| error.to_string())?;
    Ok(snapshot(state))
}
