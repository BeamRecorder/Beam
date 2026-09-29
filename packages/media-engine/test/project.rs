#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::*;
#[test]
fn project_registration_preserves_editor_and_uses_actual_session_path() {
    let root = tempfile::tempdir().unwrap();
    let id = ProjectId::new();
    let project = root.path().join("renamed-project");
    std::fs::create_dir(&project).unwrap();
    std::fs::write(
        project.join("project.json"),
        serde_json::to_vec(
            &json!({"projectId":id,"sessions":[],"name":"My project","editor":{"custom":42}}),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(directory(root.path(), id).unwrap(), project);
    let output = project.join("new-session");
    std::fs::create_dir(&output).unwrap();
    let session = beam_media_session::MediaSession::prepare_for_project(
        beam_media_session::SessionConfig {
            output_dir: output.clone(),
            screen: None,
            camera: crate::CameraSelection::Disabled,
            microphone: crate::AudioSelection::Disabled,
            system_audio: crate::AudioSelection::Disabled,
        },
        id,
    )
    .unwrap();
    register(&output, session.manifest()).unwrap();
    register(&output, session.manifest()).unwrap();
    let saved: Value =
        serde_json::from_slice(&std::fs::read(project.join("project.json")).unwrap()).unwrap();
    assert_eq!(saved["editor"]["custom"], 42);
    assert_eq!(saved["sessions"].as_array().unwrap().len(), 1);
    assert_eq!(saved["sessions"][0]["relativePath"], "new-session");
}
#[test]
fn absent_project_resolves_to_safe_uuid_directory() {
    let root = tempfile::tempdir().unwrap();
    let id = ProjectId::new();
    assert_eq!(
        directory(root.path(), id).unwrap(),
        root.path().join(id.to_string())
    );
}

#[test]
fn discarding_rejects_unowned_session_or_project_without_changing_files() {
    let root = tempfile::tempdir().unwrap();
    let id = ProjectId::new();
    let session = SessionId::new();
    let output = root.path().join("take");
    std::fs::create_dir(&output).unwrap();
    std::fs::write(output.join("screen.webm"), b"captured video").unwrap();
    let path = root.path().join("project.json");
    let bytes = serde_json::to_vec(&json!({"projectId":id,"name":"Kept name","sessions":[{"sessionId":session,"relativePath":"take"}]})).unwrap();
    std::fs::write(&path, &bytes).unwrap();
    for (project, take) in [(ProjectId::new(), session), (id, SessionId::new())] {
        assert!(discard_session(&output, project, take).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        assert_eq!(
            std::fs::read(output.join("screen.webm")).unwrap(),
            b"captured video"
        );
    }
    discard_session(&output, id, session).unwrap();
    assert!(!output.exists());
    let index: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(index["name"], "Kept name");
    assert_eq!(index["sessions"], json!([]));
}

#[cfg(unix)]
#[test]
fn discarding_refuses_a_symlinked_take() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("keep.webm"), b"keep").unwrap();
    let output = root.path().join("take");
    std::os::unix::fs::symlink(outside.path(), &output).unwrap();
    std::fs::write(root.path().join("project.json"), b"{}").unwrap();
    assert!(discard_session(&output, ProjectId::new(), SessionId::new()).is_err());
    assert_eq!(
        std::fs::read(outside.path().join("keep.webm")).unwrap(),
        b"keep"
    );
}
