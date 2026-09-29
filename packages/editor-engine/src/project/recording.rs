//! Converts manifest-authoritative native recording tracks into an editable NLE.
use super::validation;
use crate::video::zoom::suggestions;
use crate::{Clip, EditorError, Effects, MediaAsset, Project, Result, Track, TrackKind};
use beam_editor_domain::recording::{
    decisions,
    style_types::CursorMode,
    types::{CursorInteractionType, CursorPoint},
};
use beam_media_manifest::{
    ProjectManifest, SessionManifest, TrackFormat, TrackKind as RecordedKind, TrackStatus,
};
use beam_screen::cursor::CursorTelemetrySidecar;
use std::{fs::File, io::Read, path::Path};
use uuid::Uuid;

/// Imports completed segments, keeps capture failures visible, and generates native zooms.
/// A recording source remains within its existing project; no recording bytes are rewritten.
pub fn open(root: &Path) -> Result<Project> {
    let manifest: ProjectManifest = read(&root.join("project.json"))?;
    if !(1..=2).contains(&manifest.schema_version) {
        return Err(EditorError::Invalid(
            "unsupported recording project version".into(),
        ));
    }
    let mut project = Project::new(if manifest.name.trim().is_empty() {
        "Recording".into()
    } else {
        manifest.name.clone()
    });
    project.id = Uuid::parse_str(&manifest.project_id.to_string())
        .map_err(|e| EditorError::Invalid(e.to_string()))?;
    project.tracks = Default::default();
    let mut offset = 0;
    for reference in manifest.sessions {
        validation::relative_path(&reference.relative_path)?;
        let session_root = root.join(&reference.relative_path);
        let session_path =
            validation::source_path(root, &format!("{}/manifest.json", reference.relative_path))?;
        let session: SessionManifest = read(&session_path)?;
        if !(1..=2).contains(&session.schema_version)
            || session.project_id != manifest.project_id
            || session.session_id != reference.session_id
        {
            return Err(EditorError::Invalid(
                "recording session identity or version does not match the project".into(),
            ));
        }
        project.warnings.extend(session.warnings.clone());
        let telemetry_path = session_root.join("cursor/telemetry.json");
        let telemetry = if telemetry_path.exists() {
            let relative = format!("{}/cursor/telemetry.json", reference.relative_path);
            let sidecar: CursorTelemetrySidecar = read(&validation::source_path(root, &relative)?)?;
            if sidecar.version != 2 {
                return Err(EditorError::Invalid(
                    "unsupported cursor telemetry version".into(),
                ));
            }
            sidecar.samples
        } else {
            Vec::new()
        };
        let mut tracks = session.tracks.clone();
        tracks.sort_by_key(|t| match t.kind {
            RecordedKind::Camera => 0,
            RecordedKind::Screen => 1,
            _ => 2,
        });
        for recorded in tracks {
            if recorded.kind == RecordedKind::Cursor {
                continue;
            }
            if matches!(
                recorded.status,
                TrackStatus::Failed | TrackStatus::Interrupted
            ) {
                project.warnings.push(format!(
                    "{:?}: {}",
                    recorded.kind,
                    recorded
                        .termination_reason
                        .as_deref()
                        .unwrap_or("recording interrupted")
                ));
            }
            let is_video = matches!(recorded.format, TrackFormat::Video { .. });
            let track = Track::new(
                format!("{:?}", recorded.kind),
                if is_video {
                    TrackKind::Video
                } else {
                    TrackKind::Audio
                },
            );
            for segment in recorded.segments.iter().filter(|s| s.complete) {
                let end = segment.end_ns.ok_or_else(|| {
                    EditorError::Invalid("completed recording segment has no end".into())
                })?;
                let duration = end.saturating_sub(segment.start_ns) / 1_000_000;
                if duration == 0 {
                    project
                        .warnings
                        .push("An empty recording segment was skipped".into());
                    continue;
                }
                let relative = format!("{}/{}", reference.relative_path, segment.path);
                let source = validation::source_path(root, &relative)?;
                let version = crate::service::artifacts::version(&source)?;
                let (width, height) = match recorded.format {
                    TrackFormat::Video { width, height, .. } => (width, height),
                    _ => (0, 0),
                };
                if recorded.kind == RecordedKind::Screen {
                    project.canvas = crate::Canvas::from_source(width, height);
                }
                let start_ms = segment.start_ns / 1_000_000;
                let cursor = if recorded.kind == RecordedKind::Screen {
                    suggestions::normalize(
                        &telemetry
                            .iter()
                            .filter(|p| p.time_ms >= start_ms && p.time_ms < start_ms + duration)
                            .cloned()
                            .map(|mut p| {
                                p.time_ms -= start_ms;
                                CursorPoint {
                                    time_ms: p.time_ms,
                                    cx: p.cx,
                                    cy: p.cy,
                                    interaction_type: p.interaction_type.map(interaction),
                                }
                            })
                            .collect::<Vec<_>>(),
                        duration,
                    )
                } else {
                    vec![]
                };
                let zooms = suggestions::generate(&cursor, duration, &[]);
                let asset = MediaAsset {
                    identity: Some(beam_editor_domain::project::types::SourceIdentity {
                        sha256: version.sha256,
                        byte_length: version.byte_length,
                    }),
                    is_image: false,
                    id: Uuid::new_v4(),
                    name: format!("{:?}", recorded.kind),
                    path: relative,
                    duration_ms: duration,
                    width,
                    height,
                    has_video: is_video,
                    has_audio: !is_video,
                    cursor: cursor.into(),
                    zooms: zooms.into(),
                    recording: true,
                    cursor_mode: cursor_mode(recorded.kind, session.cursor_mode),
                };
                let effects = if recorded.kind == RecordedKind::Camera {
                    Effects {
                        scale: 0.28,
                        x: 0.82,
                        y: 0.78,
                        auto_zoom: false,
                        ..Effects::default()
                    }
                } else {
                    Effects::default()
                };
                let mut clip = Clip {
                    cursor_style: None,
                    title: None,
                    instances: vec![],
                    rate: Default::default(),
                    animation_offset_ms: 0,
                    generator: None,
                    link_group: None,
                    id: Uuid::new_v4(),
                    asset_id: asset.id,
                    track_id: track.id,
                    start_ms: offset + start_ms,
                    source_in_ms: 0,
                    duration_ms: duration,
                    effects,
                };
                decisions::apply_suggestions(&mut clip, &asset);
                project.clips.try_push(clip)?;
                project.assets.push(asset);
            }
            project.tracks.try_push(track)?;
        }
        offset += session.duration_ns / 1_000_000;
    }
    if !project.tracks.headers().any(|t| t.kind == TrackKind::Video) {
        project
            .tracks
            .try_insert(0, Track::new("Video".into(), TrackKind::Video))?;
    }
    if !project.tracks.headers().any(|t| t.kind == TrackKind::Audio) {
        project
            .tracks
            .try_push(Track::new("Audio".into(), TrackKind::Audio))?;
    }
    validation::project(&project)?;
    Ok(project)
}
fn read<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|e| crate::shared::storage(path, e))?
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| crate::shared::storage(path, e))?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err(EditorError::Invalid(
            "recording metadata exceeds 32 MiB".into(),
        ));
    }
    Ok(serde_json::from_slice(&bytes)?)
}

fn cursor_mode(kind: RecordedKind, mode: beam_media_manifest::CursorMode) -> CursorMode {
    if kind != RecordedKind::Screen {
        return CursorMode::Absent;
    }
    match mode {
        beam_media_manifest::CursorMode::Separated => CursorMode::Separated,
        beam_media_manifest::CursorMode::BakedIn => CursorMode::BakedIn,
        beam_media_manifest::CursorMode::Absent => CursorMode::Absent,
        beam_media_manifest::CursorMode::Unknown => CursorMode::Unknown,
    }
}
fn interaction(kind: beam_screen::cursor::CursorInteractionType) -> CursorInteractionType {
    match kind {
        beam_screen::cursor::CursorInteractionType::Move => CursorInteractionType::Move,
        beam_screen::cursor::CursorInteractionType::Click => CursorInteractionType::Click,
        beam_screen::cursor::CursorInteractionType::DoubleClick => {
            CursorInteractionType::DoubleClick
        }
        beam_screen::cursor::CursorInteractionType::RightClick => CursorInteractionType::RightClick,
        beam_screen::cursor::CursorInteractionType::MiddleClick => {
            CursorInteractionType::MiddleClick
        }
        beam_screen::cursor::CursorInteractionType::Mouseup => CursorInteractionType::Mouseup,
    }
}
