use beam_editor_engine::export::{
    segments,
    types::{Container, VideoEncoder},
};
use std::sync::{Arc, atomic::AtomicBool};
#[test]
fn cancellation_before_source_allocation_preserves_the_destination() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("cancelled.webm");
        let project = crate::video::effects::project();
        assert!(
            !segments::render(
                root.path(),
                &project,
                &path,
                Container::Webm,
                VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
                Arc::new(AtomicBool::new(true)),
                |_| {}
            )
            .unwrap()
        );
        assert!(!path.exists());
    });
}
