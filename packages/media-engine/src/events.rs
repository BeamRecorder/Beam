use crate::{RecordingEvent, RecordingEvents, RecordingState, RecordingStatus};
use std::{collections::VecDeque, sync::Mutex};

const CAPACITY: usize = 64;

pub(crate) struct EventLog {
    inner: Mutex<(u64, VecDeque<RecordingEvent>, RecordingStatus)>,
}

impl EventLog {
    pub(crate) fn new() -> Self {
        Self {
            inner: Mutex::new((
                0,
                VecDeque::new(),
                RecordingStatus {
                    state: RecordingState::Idle,
                    session_id: None,
                    manifest_path: None,
                    manifest: None,
                    error: None,
                },
            )),
        }
    }

    pub(crate) fn publish(&self, status: RecordingStatus) {
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous = inner.2.clone();
        let timestamp_ns = status
            .manifest
            .as_ref()
            .map_or(0, |manifest| manifest.duration_ns);
        let mut changes = Vec::new();
        if previous.state != status.state || previous.error != status.error {
            changes.push((None, status.error.clone()));
        }
        if let Some(manifest) = &status.manifest {
            for track in &manifest.tracks {
                let old = previous
                    .manifest
                    .as_ref()
                    .and_then(|old| old.tracks.iter().find(|old| old.track_id == track.track_id));
                if old.is_none_or(|old| {
                    old.status != track.status || old.termination_reason != track.termination_reason
                }) {
                    changes.push((Some(track.kind), track.termination_reason.clone()));
                }
            }
        }
        for (track, cause) in changes {
            inner.0 += 1;
            let sequence = inner.0;
            if inner.1.len() == CAPACITY {
                inner.1.pop_front();
            }
            inner.1.push_back(RecordingEvent {
                sequence,
                session_id: status.session_id,
                track,
                timestamp_ns,
                state: status.state,
                cause,
            });
        }
        inner.2 = status;
    }

    pub(crate) fn read(&self, after: u64) -> RecordingEvents {
        let inner = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let oldest = inner.1.front().map_or(inner.0 + 1, |event| event.sequence);
        RecordingEvents {
            events: inner
                .1
                .iter()
                .filter(|event| event.sequence > after)
                .cloned()
                .collect(),
            missed: oldest.saturating_sub(after.saturating_add(1)),
            cursor: inner.0,
            status: inner.2.clone(),
        }
    }
}

#[path = "../test/events.rs"]
mod event_checks;
