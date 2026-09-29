use beam_editor_engine::export::{
    segments,
    types::{Container, VideoEncoder},
};
use std::sync::{Arc, atomic::AtomicBool};
#[cfg(target_os = "linux")]
#[test]
#[ignore = "VA hardware capabilities"]
fn unsupported_hardware_canvas_never_opens_the_output() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let output = root.path().join("unsupported.webm");
        let project = crate::video::effects::project();
        let encoder = VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc");
        let error = segments::render(
            root.path(),
            &project,
            &output,
            Container::Webm,
            encoder,
            Arc::new(AtomicBool::new(false)),
            |_| {},
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("cannot encode canvas 64x64"), "{error}");
        assert!(!output.exists());
    });
}
