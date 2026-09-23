#![cfg(all(test, target_os = "linux"))]
#![allow(clippy::unwrap_used)]
use super::*;
#[test]
fn stopped_native_backend_preserves_dispatch_contract_and_idempotent_cleanup() {
    let backend = super::super::linux::recording::recording_checks::stopped();
    let mut recording = ScreenRecording {
        backend: PlatformScreenRecording::Linux(backend),
    };
    assert!(recording.source_id().is_none());
    assert!(recording.video_format().is_none());
    assert!(recording.start().is_err());
    assert!(recording.pause().is_err());
    assert!(
        recording
            .prepare_resume(0, Arc::new(StartGate::new()), None)
            .is_err()
    );
    assert!(recording.is_available());
    assert_eq!(recording.metrics().frames_received(), 0);
    recording.stop().unwrap();
    recording.stop().unwrap();
}
