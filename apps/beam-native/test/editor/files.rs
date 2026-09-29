use super::files::{create, find_recording};
use beam_media_engine::ProjectId;
use serde_json::json;
use std::{fs, path::Path};

fn manifest(directory: &Path, id: ProjectId) {
    fs::create_dir_all(directory).unwrap();
    fs::write(directory.join("project.json"), json!({
        "schemaVersion":2,"projectId":id,"name":"Capture",
        "createdAtUtc":"2026-09-28T00:00:00Z","updatedAtUtc":"2026-09-28T00:00:00Z","sessions":[]
    }).to_string()).unwrap();
}

#[test]
fn uuid_lookup_reads_the_manifest_in_studio_and_instant_libraries() {
    let root = tempfile::tempdir().unwrap();
    for category in ["studio", "instant"] {
        let id = ProjectId::new();
        let directory = root.path().join(category).join("human readable folder");
        manifest(&directory, id);
        assert_eq!(
            find_recording(root.path(), &id.to_string()).unwrap(),
            directory.canonicalize().unwrap()
        );
    }
}

#[test]
fn invalid_missing_and_malformed_recordings_do_not_resolve_to_paths() {
    let root = tempfile::tempdir().unwrap();
    let id = ProjectId::new();
    assert!(find_recording(root.path(), "../../other").is_err());
    assert!(find_recording(root.path(), &id.to_string()).is_err());
    let directory = root.path().join("studio/broken");
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("project.json"), "{bad").unwrap();
    assert!(find_recording(root.path(), &id.to_string()).is_err());
    assert_eq!(
        fs::read_to_string(directory.join("project.json")).unwrap(),
        "{bad"
    );
}

#[cfg(unix)]
#[test]
fn symlinked_recordings_outside_the_library_are_skipped() {
    let root = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    let id = ProjectId::new();
    manifest(external.path(), id);
    fs::create_dir(root.path().join("studio")).unwrap();
    std::os::unix::fs::symlink(external.path(), root.path().join("studio/external")).unwrap();
    assert!(find_recording(root.path(), &id.to_string()).is_err());
}

#[test]
fn new_projects_have_independent_atomic_documents_inside_the_studio_library() {
    let root = tempfile::tempdir().unwrap();
    let controller = beam_editor_engine::EditorController::new().unwrap();
    let first = create(&controller, root.path()).unwrap();
    let second = create(&controller, root.path()).unwrap();
    assert_ne!(first.project.id, second.project.id);
    assert!(first.project.assets.is_empty() && second.project.clips.is_empty());
    let documents = fs::read_dir(root.path().join("studio"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect::<Vec<_>>();
    assert_eq!(documents.len(), 2);
    assert!(
        documents
            .iter()
            .all(|path| path.join("editor.beam.json").is_file())
    );
}
