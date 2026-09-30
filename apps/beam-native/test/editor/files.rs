use super::files::{create, find_recording, list_projects, project_preview_video};
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
    let controller = super::session::Session::new(
        std::sync::Arc::new(beam_editor_engine::EditorController::new().unwrap()),
        None,
    );
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
    let listed = list_projects(root.path()).unwrap();
    assert_eq!(listed.len(), 2);
    assert!(
        listed
            .iter()
            .any(|project| project.id == first.project.id.to_string())
    );
    let resolved = find_recording(root.path(), &first.project.id.to_string()).unwrap();
    assert!(
        documents
            .iter()
            .any(|path| path.canonicalize().unwrap() == resolved)
    );
}

#[test]
fn project_library_uses_saved_names_and_most_recent_first() {
    let root = tempfile::tempdir().unwrap();
    let older = ProjectId::new();
    let older_folder = root.path().join("studio").join(older.to_string());
    manifest(&older_folder, older);
    std::thread::sleep(std::time::Duration::from_millis(20));
    let newer = ProjectId::new();
    let newer_folder = root.path().join("instant").join(newer.to_string());
    manifest(&newer_folder, newer);
    fs::write(
        newer_folder.join("editor.beam.json"),
        json!({
            "projectId":newer.to_string(), "projectName":"My latest take"
        })
        .to_string(),
    )
    .unwrap();
    let listed = list_projects(root.path()).unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].id, newer.to_string());
    assert_eq!(listed[0].name, "My latest take");
    assert_eq!(listed[1].id, older.to_string());
    assert_eq!(serde_json::to_value(&listed[0]).unwrap()["kind"], "instant");
}

fn recording_with_segment(directory: &Path, relative_path: &str, segment_path: &str) {
    let project_id = ProjectId::new();
    let session_id = beam_media_manifest::SessionId::new();
    fs::create_dir_all(directory.join("take")).unwrap();
    fs::write(
        directory.join("project.json"),
        json!({
            "schemaVersion":2,"projectId":project_id,"name":"Capture",
            "createdAtUtc":"2026-09-28T00:00:00Z","updatedAtUtc":"2026-09-28T00:00:00Z",
            "sessions":[{"sessionId":session_id,"relativePath":relative_path}]
        })
        .to_string(),
    )
    .unwrap();
    fs::write(directory.join("take/manifest.json"), json!({
        "schemaVersion":2,"projectId":project_id,"sessionId":session_id,
        "createdAtUtc":"2026-09-28T00:00:00Z","sessionStartMonotonicNs":0,
        "durationNs":1000000000,"platform":{"os":"linux","architecture":"x86_64","backend":"test"},
        "selectedSources":{"screen":null,"systemAudio":null,"microphone":null,"camera":null},
        "tracks":[{"trackId":beam_media_manifest::TrackId::new(),"kind":"screen",
            "sourceId":null,"format":{"mediaType":"video","codec":"vp9","width":1280,"height":720,"nominalFps":30},
            "segments":[{"segmentId":beam_media_manifest::SegmentId::new(),"path":segment_path,
                "startNs":0,"endNs":1000000000,"complete":true}],
            "metrics":{},"status":"completed","terminationReason":null}],
        "permissions":{"screen":null,"accessibility":null},"completed":true
    }).to_string()).unwrap();
}

#[test]
fn preview_finds_recorded_screen_segment_and_rejects_manifest_path_escapes() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("project");
    fs::create_dir(&directory).unwrap();
    recording_with_segment(&directory, "take", "screen.webm");
    fs::write(directory.join("take/screen.webm"), b"video").unwrap();
    assert_eq!(
        project_preview_video(&directory),
        Some(directory.join("take/screen.webm"))
    );
    recording_with_segment(&directory, "../outside", "screen.webm");
    assert_eq!(project_preview_video(&directory), None);
    recording_with_segment(&directory, "take", "../outside.webm");
    assert_eq!(project_preview_video(&directory), None);
    #[cfg(unix)]
    {
        recording_with_segment(&directory, "take", "linked.webm");
        fs::write(root.path().join("outside.webm"), b"outside").unwrap();
        std::os::unix::fs::symlink(
            root.path().join("outside.webm"),
            directory.join("take/linked.webm"),
        )
        .unwrap();
        assert_eq!(project_preview_video(&directory), None);
    }
}
