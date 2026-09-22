#![cfg(target_os = "macos")]

use std::any::TypeId;

use beam_audio::{AudioCapture, SystemAudioCapture};

#[test]
fn macos_output_uses_the_shared_audio_capture_interface() {
    assert_eq!(
        TypeId::of::<SystemAudioCapture>(),
        TypeId::of::<AudioCapture>()
    );
    fn shared_queue_contract(capture: &SystemAudioCapture) -> (usize, usize) {
        capture.queue_depth()
    }
    let _ = shared_queue_contract;
}
