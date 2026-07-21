use crate::model::{
    ProjectEditorState, ProjectId, ProjectManifest, ProjectSession, SCHEMA_VERSION, SessionId,
};

use super::{ProjectLayout, write_atomic};

const MAX_PROJECT_NAME_SUFFIX: u32 = i32::MAX as u32;

fn generated_project_base_name(project_id: ProjectId) -> String {
    const ADJECTIVES: [&str; 8] = [
        "Bright", "Calm", "Clever", "Golden", "Quiet", "Rapid", "Soft", "Vivid",
    ];
    const NOUNS: [&str; 8] = [
        "Aurora", "Canvas", "Comet", "Horizon", "Orbit", "Pixel", "Signal", "Studio",
    ];
    let uuid = project_id.as_uuid();
    let bytes = uuid.as_bytes();
    format!(
        "{} {}",
        ADJECTIVES[usize::from(bytes[0]) % ADJECTIVES.len()],
        NOUNS[usize::from(bytes[1]) % NOUNS.len()]
    )
}

fn existing_project_name(
    root: &std::path::Path,
    candidate: &str,
) -> Result<bool, crate::CaptureError> {
    let entries =
        std::fs::read_dir(root).map_err(|error| crate::CaptureError::storage(root, error))?;
    for entry in entries {
        let entry = entry.map_err(|error| crate::CaptureError::storage(root, error))?;
        if !entry
            .file_type()
            .map_err(|error| crate::CaptureError::storage(&entry.path(), error))?
            .is_dir()
        {
            continue;
        }
        let manifest_path = entry.path().join("project.json");
        let Ok(contents) = std::fs::read(&manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_slice::<ProjectManifest>(&contents) else {
            continue;
        };
        if manifest.name == candidate {
            return Ok(true);
        }
    }
    Ok(false)
}

fn generated_project_name(
    root: &std::path::Path,
    project_id: ProjectId,
) -> Result<String, crate::CaptureError> {
    let base_name = generated_project_base_name(project_id);
    if !existing_project_name(root, &base_name)? {
        return Ok(base_name);
    }
    let uuid = project_id.as_uuid();
    let bytes = uuid.as_bytes();
    let initial_suffix = (u32::from_be_bytes([bytes[2], bytes[3], bytes[4], bytes[5]])
        % MAX_PROJECT_NAME_SUFFIX)
        + 1;
    for offset in 0..MAX_PROJECT_NAME_SUFFIX {
        let suffix = ((initial_suffix - 1 + offset) % MAX_PROJECT_NAME_SUFFIX) + 1;
        let candidate = format!("{base_name} {suffix}");
        if !existing_project_name(root, &candidate)? {
            return Ok(candidate);
        }
    }
    Err(crate::CaptureError::InvalidConfiguration(
        "unable to generate a unique project name".into(),
    ))
}

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
            name: generated_project_name(root, project_id)?,
            created_at_utc: now_utc.into(),
            updated_at_utc: now_utc.into(),
            sessions: Vec::new(),
            editor: ProjectEditorState::default(),
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
