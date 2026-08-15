use std::path::Path;
use std::path::PathBuf;
use std::{fs::OpenOptions, io::Write};

use crate::storage::segment;
use crate::{
    CaptureError,
    catalog::CatalogSnapshot,
    model::{
        CaptureRequest, CursorSelection, HealthEvent, MediaFormat, ScreenSelection,
        SelectedSources, SourceDescriptor, SourceId, TimingAnchor, TrackFormat, TrackId, TrackKind,
        TrackMetadata, TrackMetrics, TrackStatus,
    },
};

use super::recording::RecordingSession;

impl Drop for RecordingSession {
    fn drop(&mut self) {
        if matches!(
            self.state(),
            super::SessionState::Armed
                | super::SessionState::Recording
                | super::SessionState::Paused
                | super::SessionState::Degraded
        ) {
            let _result = self.stop();
        }
    }
}

pub(super) fn record_result(result: Result<(), CaptureError>, first: &mut Option<CaptureError>) {
    if let Err(error) = result {
        first.get_or_insert(error);
    }
}

pub(super) fn track_metadata(
    request: &CaptureRequest,
    snapshot: &CatalogSnapshot,
) -> Result<Vec<TrackMetadata>, CaptureError> {
    let mut tracks = Vec::new();
    if let Some(ScreenSelection::Source { source_id }) = &request.screen {
        let source = source(snapshot, source_id)?;
        let (mut width, mut height, fps) = video_format(source, request.recording.target_fps);
        if let Some(region) = request.region {
            let (_, _, right, bottom) = region.pixel_rect(width, height)?;
            let (left, top, _, _) = region.pixel_rect(width, height)?;
            width = right.saturating_sub(left);
            height = bottom.saturating_sub(top);
        }
        tracks.push(new_track(
            TrackKind::Screen,
            Some(source_id.clone()),
            TrackFormat::Video {
                codec: "h264".into(),
                width,
                height,
                nominal_fps: fps,
            },
        ));
    }
    if matches!(request.cursor, CursorSelection::Separate { .. }) {
        tracks.push(new_track(
            TrackKind::Cursor,
            None,
            TrackFormat::Events {
                format: "json".into(),
            },
        ));
    }
    Ok(tracks)
}

fn new_track(kind: TrackKind, source_id: Option<SourceId>, format: TrackFormat) -> TrackMetadata {
    TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id,
        format,
        segments: Vec::new(),
        metrics: TrackMetrics::default(),
        status: TrackStatus::Preparing,
        termination_reason: None,
    }
}

pub(super) fn add_portal_screen_track(
    tracks: &mut Vec<TrackMetadata>,
    source_id: SourceId,
    codec: String,
    width: u32,
    height: u32,
    nominal_fps: u32,
) {
    tracks.push(new_track(
        TrackKind::Screen,
        Some(source_id),
        TrackFormat::Video {
            codec,
            width,
            height,
            nominal_fps,
        },
    ));
}

pub(super) fn source<'a>(
    snapshot: &'a CatalogSnapshot,
    id: &SourceId,
) -> Result<&'a SourceDescriptor, CaptureError> {
    snapshot
        .sources
        .iter()
        .find(|source| &source.id == id)
        .ok_or_else(|| CaptureError::SourceNotFound(id.to_string()))
}

pub(super) fn video_format(source: &SourceDescriptor, fallback_fps: u32) -> (u32, u32, u32) {
    source
        .capabilities
        .formats
        .iter()
        .find_map(|format| match format {
            MediaFormat::Video {
                width, height, fps, ..
            } => Some((*width, *height, *fps)),
            MediaFormat::Audio { .. } => None,
        })
        .unwrap_or((0, 0, fallback_fps))
}

pub(super) fn add_segment(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    generation: u32,
    extension: &str,
    start_ns: u64,
) -> Result<(), CaptureError> {
    let track = track_mut(tracks, kind)
        .ok_or_else(|| CaptureError::Backend(format!("missing {kind:?} track metadata")))?;
    track.segments.push(segment(
        format!(
            "{}/segment-{generation:04}.{extension}",
            track_directory(kind)
        ),
        start_ns,
    ));
    track.status = TrackStatus::Recording;
    Ok(())
}

pub(super) fn track_mut(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
) -> Option<&mut TrackMetadata> {
    tracks.iter_mut().find(|track| track.kind == kind)
}

pub(super) fn track_for(tracks: &[TrackMetadata], kind: TrackKind) -> Option<&TrackMetadata> {
    tracks.iter().find(|track| track.kind == kind)
}

pub(super) fn segment_path(
    layout: &crate::storage::SessionLayout,
    kind: TrackKind,
    generation: u32,
    extension: &str,
) -> PathBuf {
    layout
        .track_dir(kind)
        .join(format!("segment-{generation:04}.{extension}"))
}

fn track_directory(kind: TrackKind) -> &'static str {
    match kind {
        TrackKind::Screen => "screen",
        TrackKind::SystemAudio => "system-audio",
        TrackKind::Microphone => "microphone",
        TrackKind::Camera => "camera",
        TrackKind::Cursor => "cursor",
    }
}

pub(super) fn update_video_metrics(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    received: u64,
    dropped: u64,
) {
    if let Some(track) = track_mut(tracks, kind) {
        track.metrics.frames_acquired += received;
        track.metrics.frames_encoded += received;
        track.metrics.frames_received += received;
        track.metrics.frames_dropped += dropped;
    }
}

pub(super) fn selected_sources(
    request: &CaptureRequest,
    _snapshot: &CatalogSnapshot,
) -> SelectedSources {
    SelectedSources {
        screen: match &request.screen {
            Some(ScreenSelection::Source { source_id }) => Some(source_id.clone()),
            Some(ScreenSelection::Portal { kind, .. }) => portal_source_id(kind).ok(),
            _ => None,
        },
        system_audio: None,
        microphone: None,
        // Browser-owned camera capture merges its selected source after the native session
        // has finalized. Rust never opens a camera device.
        camera: None,
    }
}

pub(super) fn platform_backend() -> &'static str {
    if cfg!(windows) {
        "windows-graphics-capture"
    } else if cfg!(target_os = "macos") {
        "screen-capture-kit"
    } else if cfg!(target_os = "linux") {
        "xdg-portal-pipewire"
    } else {
        "unsupported"
    }
}

pub(super) fn portal_source_id(
    kind: &crate::model::PortalSourceKind,
) -> Result<SourceId, CaptureError> {
    let suffix = match kind {
        crate::model::PortalSourceKind::Monitor => "monitor",
        crate::model::PortalSourceKind::Window => "window",
        crate::model::PortalSourceKind::MonitorOrWindow => "monitor-or-window",
    };
    SourceId::new(format!("portal:{suffix}"))
}

pub(super) fn invalid_transition(from: super::SessionState, to: &str) -> CaptureError {
    CaptureError::InvalidTransition {
        from: format!("{from:?}"),
        to: to.into(),
    }
}

pub(super) fn now_utc() -> Result<String, CaptureError> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| CaptureError::Backend(error.to_string()))
}

fn insufficient_disk_space_message(available: u64, minimum: u64) -> String {
    format!(
        "insufficient disk space: {} MB available, {} MB required",
        available / 1024 / 1024,
        minimum.div_ceil(1024 * 1024)
    )
}

pub(super) fn ensure_free_space(root: &Path, minimum: u64) -> Result<(), CaptureError> {
    std::fs::create_dir_all(root).map_err(|error| CaptureError::storage(root, error))?;
    let available =
        fs2::available_space(root).map_err(|error| CaptureError::storage(root, error))?;
    if available < minimum {
        return Err(CaptureError::InvalidConfiguration(
            insufficient_disk_space_message(available, minimum),
        ));
    }
    Ok(())
}

#[cfg(test)]
#[path = "recording_support_tests.rs"]
mod tests;

pub(super) fn checkpoint_tracks(
    layout: &crate::storage::SessionLayout,
    tracks: &[TrackMetadata],
) -> Result<(), CaptureError> {
    for track in tracks {
        let path = layout.track_dir(track.kind).join("track.json");
        crate::storage::write_atomic(&path, &serde_json::to_vec_pretty(track)?)?;
    }
    Ok(())
}

pub(super) fn write_timing_anchors(
    layout: &crate::storage::SessionLayout,
    tracks: &[TrackMetadata],
    session_ns: u64,
) -> Result<(), CaptureError> {
    for track in tracks
        .iter()
        .filter(|track| track.status != TrackStatus::Failed)
    {
        let (native_position, native_rate) = match &track.format {
            TrackFormat::Video { nominal_fps, .. } => (
                track.metrics.frames_received,
                u64::from((*nominal_fps).max(1)),
            ),
            TrackFormat::Audio {
                sample_rate,
                channels,
                ..
            } => {
                let channels = u64::from((*channels).max(1));
                (
                    track.metrics.samples_received / channels,
                    u64::from((*sample_rate).max(1)),
                )
            }
            TrackFormat::Events { .. } => (track.metrics.frames_received, 1_000_000_000),
        };
        append_jsonl(
            &layout.timing(),
            &TimingAnchor {
                track_id: track.track_id,
                session_ns,
                native_position,
                native_rate,
            },
        )?;
    }
    Ok(())
}

pub(super) fn write_health_snapshot(
    layout: &crate::storage::SessionLayout,
    tracks: &[TrackMetadata],
    session_ns: u64,
) -> Result<(), CaptureError> {
    for track in tracks {
        append_jsonl(
            &layout.health(),
            &HealthEvent::TrackHealth {
                track_id: track.track_id,
                session_ns,
                metrics: track.metrics.clone(),
            },
        )?;
        if let Some(message) = &track.termination_reason {
            append_jsonl(
                &layout.health(),
                &HealthEvent::Error {
                    track_id: Some(track.track_id),
                    session_ns,
                    code: "track-failed".into(),
                    message: message.clone(),
                },
            )?;
        }
    }
    Ok(())
}

pub(super) fn append_jsonl(path: &Path, value: &impl serde::Serialize) -> Result<(), CaptureError> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| CaptureError::storage(path, error))?;
    serde_json::to_writer(&mut file, value)?;
    file.write_all(b"\n")
        .map_err(|error| CaptureError::storage(path, error))?;
    file.flush()
        .map_err(|error| CaptureError::storage(path, error))
}
