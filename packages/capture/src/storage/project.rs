use crate::model::{ProjectId, ProjectManifest, ProjectSession, SCHEMA_VERSION, SessionId};

use super::{ProjectLayout, write_atomic};

pub fn create_or_update_project(
    root: &std::path::Path,
    project_id: ProjectId,
    session_id: SessionId,
    now_utc: &str,
) -> Result<ProjectManifest, crate::CaptureError> {
    let layout = ProjectLayout::new(root, project_id);
    std::fs::create_dir_all(layout.project_dir())
        .map_err(|e| crate::CaptureError::storage(&layout.project_dir(), e))?;
    let path = layout.project_manifest();
    let mut project = if path.exists() {
        serde_json::from_slice(
            &std::fs::read(&path).map_err(|e| crate::CaptureError::storage(&path, e))?,
        )?
    } else {
        ProjectManifest {
            schema_version: SCHEMA_VERSION,
            project_id,
            created_at_utc: now_utc.into(),
            updated_at_utc: now_utc.into(),
            sessions: Vec::new(),
        }
    };
    if project.project_id != project_id {
        return Err(crate::CaptureError::InvalidConfiguration(
            "project id collision".into(),
        ));
    }
    if !project
        .sessions
        .iter()
        .any(|entry| entry.session_id == session_id)
    {
        project.sessions.push(ProjectSession {
            session_id,
            relative_path: format!("session-{session_id}"),
        });
    }
    project.updated_at_utc = now_utc.into();
    write_atomic(&path, &serde_json::to_vec_pretty(&project)?)?;
    Ok(project)
}
