#![allow(clippy::expect_used)]

use capture::{
    model::{ProjectId, SessionId, TrackKind},
    storage::ProjectLayout,
};

#[test]
fn legacy_capture_layout_uses_the_shared_track_directory_names() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let session = ProjectLayout::new(temporary.path(), ProjectId::new()).session(SessionId::new());
    session.create().expect("layout");
    assert_eq!(
        session
            .track_dir(TrackKind::SystemAudio)
            .file_name()
            .and_then(|name| name.to_str()),
        Some("system-audio")
    );
    assert_eq!(
        session
            .track_dir(TrackKind::Camera)
            .file_name()
            .and_then(|name| name.to_str()),
        Some("camera")
    );
}
