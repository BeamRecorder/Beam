#![allow(clippy::expect_used)]

use beam_media_manifest::{ProjectId, ProjectLayout, SessionId, write_atomic};

#[test]
fn public_storage_exports_publish_an_atomic_session_checkpoint() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let layout = ProjectLayout::new(temporary.path(), ProjectId::new()).session(SessionId::new());
    layout.create().expect("layout");
    let checkpoint = layout.partial_manifest();
    write_atomic(&checkpoint, b"{\"completed\":false}").expect("write");
    assert_eq!(
        std::fs::read(checkpoint).expect("read"),
        b"{\"completed\":false}"
    );
}
