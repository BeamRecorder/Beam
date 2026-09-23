use crate::EngineError;
use beam_media_manifest::{ProjectId, SessionManifest, write_atomic};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

pub(crate) fn directory(root: &Path, id: ProjectId) -> Result<PathBuf, EngineError> {
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let path = entry.path().join("project.json");
        if std::fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            continue;
        }
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
            continue;
        };
        if value.get("projectId").and_then(Value::as_str) == Some(&id.to_string()) {
            return Ok(entry.path());
        }
    }
    Ok(root.join(id.to_string()))
}

pub(crate) fn register(output: &Path, session: &SessionManifest) -> Result<(), EngineError> {
    let directory = output
        .parent()
        .ok_or_else(|| EngineError::InvalidConfiguration("missing project directory".into()))?;
    let path = directory.join("project.json");
    if std::fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(EngineError::InvalidConfiguration(
            "project manifest must not be a symlink".into(),
        ));
    }
    let mut project: Value = if path.exists() {
        serde_json::from_slice(&std::fs::read(&path)?)
            .map_err(|error| EngineError::InvalidConfiguration(error.to_string()))?
    } else {
        json!({"schemaVersion":2,"projectId":session.project_id,"name":"Untitled recording","createdAtUtc":session.created_at_utc,"updatedAtUtc":session.created_at_utc,"sessions":[]})
    };
    if project.get("projectId") != Some(&json!(session.project_id)) {
        return Err(EngineError::InvalidConfiguration(
            "project identifier collision".into(),
        ));
    }
    let sessions = project
        .get_mut("sessions")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| EngineError::InvalidConfiguration("invalid project sessions".into()))?;
    if !sessions
        .iter()
        .any(|item| item.get("sessionId") == Some(&json!(session.session_id)))
    {
        let relative = output
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| EngineError::InvalidConfiguration("invalid session directory".into()))?;
        sessions.push(json!({"sessionId":session.session_id,"relativePath":relative}));
    }
    project["updatedAtUtc"] = json!(session.created_at_utc);
    let bytes = serde_json::to_vec_pretty(&project)
        .map_err(|error| EngineError::InvalidConfiguration(error.to_string()))?;
    write_atomic(&path, &bytes).map_err(|error| EngineError::Media(error.to_string()))
}

#[path = "../test/project.rs"]
mod project_checks;
