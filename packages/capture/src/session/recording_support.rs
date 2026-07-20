use std::path::{Path, PathBuf};
use std::{fs::OpenOptions, io::Write};

use crate::{
    CaptureError,
    catalog::CatalogSnapshot,
    model::{
        CaptureRequest, CursorSelection, FailurePolicy, HealthEvent, MediaFormat, ScreenSelection,
        SelectedSources, SourceDescriptor, SourceId, SystemAudioSelection, TimingAnchor,
        TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus,
    },
    storage::segment,
};

use super::recording::RecordingSession;

impl Drop for RecordingSession {
    fn drop(&mut self) {
        if matches!(
            self.state(),
            super::SessionState::Recording | super::SessionState::Paused
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

pub(super) fn optional_failure(
    request: &CaptureRequest,
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    error: CaptureError,
) -> Result<(), CaptureError> {
    if request.failure_policy == FailurePolicy::FailFast {
        return Err(error);
    }
    if let Some(track) = track_mut(tracks, kind) {
        track.status = TrackStatus::Failed;
        track.termination_reason = Some(error.to_string());
        track.metrics.interruptions = track.metrics.interruptions.saturating_add(1);
    }
    Ok(())
}

pub(super) fn track_metadata(
    request: &CaptureRequest,
    snapshot: &CatalogSnapshot,
) -> Result<Vec<TrackMetadata>, CaptureError> {
    let mut tracks = Vec::new();
    if let Some(ScreenSelection::Source { source_id }) = &request.screen {
        let source = source(snapshot, source_id)?;
        let (width, height, fps) = video_format(source, request.recording.target_fps);
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
    if request.system_audio.is_some() {
        tracks.push(new_track(
            TrackKind::SystemAudio,
            system_audio_id(request, snapshot),
            TrackFormat::Audio {
                sample_format: "f32".into(),
                sample_rate: 0,
                channels: 0,
            },
        ));
    }
    if let Some(selection) = &request.microphone {
        tracks.push(new_track(
            TrackKind::Microphone,
            Some(selection.source_id.clone()),
            TrackFormat::Audio {
                sample_format: "f32".into(),
                sample_rate: 0,
                channels: 0,
            },
        ));
    }
    if let Some(selection) = &request.camera {
        let source = source(snapshot, &selection.source_id)?;
        let (width, height, fps) = video_format(source, selection.preferred_fps.unwrap_or(30));
        tracks.push(new_track(
            TrackKind::Camera,
            Some(selection.source_id.clone()),
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

#[cfg(any(windows, target_os = "macos"))]
pub(super) fn update_video_metrics(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    received: u64,
    dropped: u64,
) {
    if let Some(track) = track_mut(tracks, kind) {
        track.metrics.frames_received += received;
        track.metrics.frames_dropped += dropped;
    }
}

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

pub(super) fn selected_sources(
    request: &CaptureRequest,
    snapshot: &CatalogSnapshot,
) -> SelectedSources {
    SelectedSources {
        screen: match &request.screen {
            Some(ScreenSelection::Source { source_id }) => Some(source_id.clone()),
            _ => None,
        },
        system_audio: system_audio_id(request, snapshot),
        microphone: request
            .microphone
            .as_ref()
            .map(|selection| selection.source_id.clone()),
        camera: request
            .camera
            .as_ref()
            .map(|selection| selection.source_id.clone()),
    }
}

fn system_audio_id(request: &CaptureRequest, snapshot: &CatalogSnapshot) -> Option<SourceId> {
    match &request.system_audio {
        Some(SystemAudioSelection::OutputDevice(id)) => Some(id.clone()),
        Some(SystemAudioSelection::DefaultMix | SystemAudioSelection::ScreenCaptureMix) => snapshot
            .sources
            .iter()
            .find(|source| {
                source.kind == crate::model::SourceKind::SystemAudio && source.is_default
            })
            .map(|source| source.id.clone()),
        None => None,
    }
}

pub(super) fn platform_backend() -> &'static str {
    if cfg!(windows) {
        "windows-graphics-capture"
    } else if cfg!(target_os = "macos") {
        "screen-capture-kit"
    } else {
        "pipewire"
    }
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

pub(super) fn ensure_free_space(root: &Path, minimum: u64) -> Result<(), CaptureError> {
    std::fs::create_dir_all(root).map_err(|error| CaptureError::storage(root, error))?;
    let available =
        fs2::available_space(root).map_err(|error| CaptureError::storage(root, error))?;
    if available < minimum {
        return Err(CaptureError::InvalidConfiguration(format!(
            "insufficient disk space: {available} bytes available, {minimum} required"
        )));
    }
    Ok(())
}

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

fn append_jsonl(path: &Path, value: &impl serde::Serialize) -> Result<(), CaptureError> {
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
