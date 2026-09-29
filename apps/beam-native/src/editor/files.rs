//! Host-owned project locations and UUID-scoped recording lookup.
use super::project_types::{EditorIndex, ProjectEntry, ProjectKind, ProjectSummary};
use beam_editor_engine::video::types::EditorSnapshot;
use beam_media_manifest::{ProjectManifest, SessionManifest, TrackFormat, TrackKind};
use serde::de::DeserializeOwned;
use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

const MAX_INDEX_BYTES: u64 = 32 * 1024 * 1024;

/// Creates an empty native project under Beam's Studio library.
pub(super) fn create(
    controller: &super::session::Session,
    root: &Path,
) -> Result<EditorSnapshot, String> {
    let id = beam_media_engine::ProjectId::new();
    controller
        .create(
            root.join("studio").join(id.to_string()),
            "Untitled project".into(),
        )
        .map_err(|e| e.to_string())
}
/// Resolves a validated recording ID without exposing a renderer-supplied filesystem path.
pub(crate) fn find_recording(root: &Path, id: &str) -> Result<PathBuf, String> {
    let id: beam_media_engine::ProjectId =
        serde_json::from_value(serde_json::Value::String(id.into())).map_err(|e| e.to_string())?;
    scan_projects(root)?
        .into_iter()
        .find(|entry| entry.summary.id == id.to_string())
        .map(|entry| entry.path)
        .ok_or_else(|| "recording project was not found".into())
}

/// Lists only native video projects that can be opened by the validated ID route.
pub(crate) fn list_projects(root: &Path) -> Result<Vec<ProjectSummary>, String> {
    Ok(scan_projects(root)?
        .into_iter()
        .map(|entry| entry.summary)
        .collect())
}

/// Finds the newest complete screen segment while rejecting manifest path escapes.
pub(crate) fn project_preview_video(project: &Path) -> Option<PathBuf> {
    let manifest = read_index::<ProjectManifest>(&project.join("project.json"))?;
    for session in manifest.sessions.iter().rev() {
        let relative = Path::new(&session.relative_path);
        if !single_component(relative) {
            continue;
        }
        let directory = project.join(relative);
        let Ok(canonical_directory) = directory.canonicalize() else {
            continue;
        };
        if canonical_directory.parent() != Some(project) {
            continue;
        }
        let Some(session_manifest) =
            read_index::<SessionManifest>(&directory.join("manifest.json"))
        else {
            continue;
        };
        if session_manifest.project_id != manifest.project_id
            || session_manifest.session_id != session.session_id
        {
            continue;
        }
        for track in session_manifest.tracks.iter().filter(|track| {
            track.kind == TrackKind::Screen && matches!(track.format, TrackFormat::Video { .. })
        }) {
            for segment in track
                .segments
                .iter()
                .rev()
                .filter(|segment| segment.complete)
            {
                let relative = Path::new(&segment.path);
                if !single_component(relative) {
                    continue;
                }
                let path = directory.join(relative);
                if fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.file_type().is_file())
                    && path
                        .canonicalize()
                        .ok()
                        .and_then(|path| path.parent().map(Path::to_path_buf))
                        == Some(canonical_directory.clone())
                {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn single_component(path: &Path) -> bool {
    let mut components = path.components();
    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
}

fn scan_projects(root: &Path) -> Result<Vec<ProjectEntry>, String> {
    let mut projects = Vec::new();
    for category in ["studio", "instant"] {
        let directory = root.join(category);
        if !directory.exists() {
            continue;
        }
        let base = directory.canonicalize().map_err(|e| e.to_string())?;
        for entry in fs::read_dir(&directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let candidate = entry.path().canonicalize().map_err(|e| e.to_string())?;
            if candidate.parent() != Some(base.as_path()) {
                continue;
            }
            let manifest_path = candidate.join("project.json");
            let index_path = candidate.join("editor.beam.json");
            let manifest = read_index::<beam_media_manifest::ProjectManifest>(&manifest_path);
            let index = read_index::<EditorIndex>(&index_path);
            let id = manifest
                .as_ref()
                .map(|value| value.project_id.to_string())
                .or_else(|| index.as_ref().map(|value| value.project_id.clone()));
            let Some(id) = id else { continue };
            if serde_json::from_value::<beam_media_engine::ProjectId>(serde_json::Value::String(
                id.clone(),
            ))
            .is_err()
                || index.as_ref().is_some_and(|value| value.project_id != id)
            {
                continue;
            }
            let name = index
                .as_ref()
                .map(|value| value.project_name.trim())
                .filter(|name| !name.is_empty())
                .or_else(|| {
                    manifest
                        .as_ref()
                        .map(|value| value.name.trim())
                        .filter(|name| !name.is_empty())
                })
                .unwrap_or("Untitled project")
                .to_owned();
            let timestamp = if index.is_some() {
                &index_path
            } else {
                &manifest_path
            };
            let updated_at_ms = fs::metadata(timestamp)
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |duration| {
                    duration.as_millis().min(u128::from(u64::MAX)) as u64
                });
            projects.push(ProjectEntry {
                summary: ProjectSummary {
                    id,
                    name,
                    kind: if manifest.is_none() {
                        ProjectKind::Project
                    } else if category == "instant" {
                        ProjectKind::Instant
                    } else {
                        ProjectKind::Recording
                    },
                    updated_at_ms,
                },
                path: candidate,
            });
        }
    }
    projects.sort_by(|a, b| {
        b.summary
            .updated_at_ms
            .cmp(&a.summary.updated_at_ms)
            .then_with(|| a.summary.id.cmp(&b.summary.id))
    });
    Ok(projects)
}

fn read_index<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.file_type().is_file() || metadata.len() > MAX_INDEX_BYTES {
        return None;
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .ok()?
        .take(MAX_INDEX_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() as u64 <= MAX_INDEX_BYTES)
        .then(|| serde_json::from_slice(&bytes).ok())
        .flatten()
}
