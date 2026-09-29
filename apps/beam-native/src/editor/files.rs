//! Host-owned project locations and UUID-scoped recording lookup.
use beam_editor_engine::{EditorController, video::types::EditorSnapshot};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

/// Creates an empty native project under Beam's Studio library.
pub(super) fn create(controller: &EditorController, root: &Path) -> Result<EditorSnapshot, String> {
    let id = beam_media_engine::ProjectId::new();
    controller
        .create(
            root.join("studio").join(id.to_string()),
            "Untitled project".into(),
        )
        .map_err(|e| e.to_string())
}
/// Resolves a validated recording ID without exposing a renderer-supplied filesystem path.
pub(super) fn find_recording(root: &Path, id: &str) -> Result<PathBuf, String> {
    let id: beam_media_engine::ProjectId =
        serde_json::from_value(serde_json::Value::String(id.into())).map_err(|e| e.to_string())?;
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
            let path = candidate.join("project.json");
            let Ok(file) = fs::File::open(path) else {
                continue;
            };
            let mut bytes = Vec::new();
            if file
                .take(32 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .is_err()
                || bytes.len() > 32 * 1024 * 1024
            {
                continue;
            }
            let Ok(manifest) =
                serde_json::from_slice::<beam_media_manifest::ProjectManifest>(&bytes)
            else {
                continue;
            };
            if manifest.project_id == id {
                return Ok(candidate);
            }
        }
    }
    Err("recording project was not found".into())
}
