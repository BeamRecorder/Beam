use crate::{
    CaptureError,
    model::{FailurePolicy, TrackKind, TrackMetadata, TrackStatus},
};

use super::super::recording_support::track_mut;

#[cfg(any(windows, target_os = "macos"))]
pub(super) fn handle_optional_failure(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    policy: FailurePolicy,
    error: CaptureError,
) -> Result<(), CaptureError> {
    if policy == FailurePolicy::FailFast {
        return Err(error);
    }
    mark_optional_failed(tracks, kind, error);
    Ok(())
}

#[cfg(any(windows, target_os = "macos"))]
pub(super) fn mark_optional_failed(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    error: CaptureError,
) {
    if let Some(track) = track_mut(tracks, kind) {
        track.status = TrackStatus::Failed;
        track.termination_reason = Some(error.to_string());
    }
}

#[cfg(any(windows, target_os = "macos"))]
pub(super) fn update_audio_metrics(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    received: u64,
    dropped: u64,
    interruptions: u64,
) {
    if let Some(track) = track_mut(tracks, kind) {
        track.metrics.samples_received += received;
        track.metrics.samples_dropped += dropped;
        track.metrics.interruptions += interruptions;
    }
}

#[cfg(any(windows, target_os = "macos"))]
pub(super) fn mark_track_failed(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    result: &Result<(), CaptureError>,
) {
    let Err(error) = result else { return };
    if let Some(track) = track_mut(tracks, kind) {
        track.status = TrackStatus::Failed;
        track.termination_reason = Some(error.to_string());
    }
}
