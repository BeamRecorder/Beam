#![allow(clippy::expect_used)]
use super::*;
use crate::screen::win::capture_handler::{CaptureHandler, HandlerFlags};
fn pending_handler(region: Option<ScreenRegion>) -> CaptureHandler {
    CaptureHandler::from_flags(HandlerFlags {
        output: "unused-test-output.mp4".into(),
        bitrate: 8_000_000,
        fps: 30,
        metrics: Default::default(),
        start_gate: Arc::new(StartGate::new()),
        region,
        health: Default::default(),
        stopping: Default::default(),
    })
}
#[test]
fn both_full_and_region_capture_wait_for_physical_frame_dimensions() {
    for region in [
        None,
        Some(ScreenRegion {
            x: 0.25,
            y: 0.25,
            width: 0.5,
            height: 0.5,
        }),
    ] {
        let handler = pending_handler(region);
        assert!(handler.encoder.is_none());
        assert!(handler.health.lock().encoded_size.is_none());
        let settings = handler.pending_encoder.expect("pending encoder");
        assert_eq!((settings.bitrate, settings.fps), (8_000_000, 30));
        assert_eq!(settings.region, region);
    }
}
#[test]
fn finishing_before_the_first_frame_is_idempotent_and_does_not_create_media() {
    let mut handler = pending_handler(None);
    handler.finish().expect("finish");
    handler.finish().expect("finish again");
    assert!(handler.pending_encoder.is_none());
    assert!(handler.encoder.is_none());
    assert!(handler.health.lock().encoded_size.is_none());
}
#[test]
fn an_output_validation_failure_never_deletes_preexisting_media() {
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("screen.mp4");
    let bytes = b"previously recorded content";
    std::fs::write(&path, bytes).expect("media");
    assert!(validate_output(&path, 0).is_err());
    assert_eq!(std::fs::read(&path).expect("preserved media"), bytes);
    validate_output(&path, 1).expect("nonempty finalized media");
    assert_eq!(std::fs::read(&path).expect("unchanged media"), bytes);
}
#[test]
fn empty_and_missing_media_are_reported_without_fabricating_output() {
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("screen.mp4");
    assert!(validate_output(&path, 1).is_err());
    assert!(!path.exists());
    std::fs::write(&path, "").expect("empty media");
    assert!(validate_output(&path, 1).is_err());
    assert!(path.exists());
}
#[test]
fn capture_health_preserves_the_original_failure() {
    let mut health = CaptureHealth::default();
    health.fail("device removed");
    health.fail("secondary shutdown timeout");
    assert_eq!(health.failure.as_deref(), Some("device removed"));
}
