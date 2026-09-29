//! Public GPU-frame ownership and compatibility transport contracts.
#[test]
fn native_gpu_frames_are_thread_safe_and_compatibility_is_negotiated() {
    use beam_editor_engine::video::gpu::types::{ExternalFrame, PreviewTransport};
    fn send_sync<T: Send + Sync>() {}
    send_sync::<ExternalFrame>();
    assert_eq!(PreviewTransport::default(), PreviewTransport::Rgba);
    #[cfg(target_os = "linux")]
    {
        send_sync::<beam_editor_engine::video::gpu::types::DmaBufFrame>();
        assert_ne!(PreviewTransport::DmaBuf, PreviewTransport::Rgba);
    }
}
