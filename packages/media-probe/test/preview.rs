#![allow(clippy::expect_used, clippy::panic)]

#[path = "../src/preview.rs"]
mod preview;

use std::{sync::Arc, time::Duration};

use beam_camera::{CameraFormat, CameraFrame, PixelFormat};
use beam_media_core::{LatestFrame, VideoFrame};
use beam_media_session::{AudioSelection, CameraSelection, MediaSession, SessionConfig};
use preview::{PreviewWorker, gpu_action, known_gpu_memory, panic_message};

#[test]
fn gpu_memory_sentinel_only_suppresses_unknown_measurements() {
    assert_eq!(known_gpu_memory(u64::MAX), None);
    assert_eq!(known_gpu_memory(0), Some(0));
    assert_eq!(known_gpu_memory(4096), Some(4096));
}

#[test]
fn gpu_action_preserves_success_and_regular_errors() {
    assert_eq!(gpu_action(|| Ok(42)).expect("success"), 42);
    assert!(matches!(
        gpu_action(|| Err::<(), _>(beam_camera_wgpu::PreviewError::TextureTooLarge)),
        Err(beam_camera_wgpu::PreviewError::TextureTooLarge)
    ));
}

#[test]
fn gpu_action_turns_a_wgpu_panic_into_a_preview_error() {
    let error = gpu_action(|| -> Result<(), beam_camera_wgpu::PreviewError> {
        panic!("wgpu error: Out of Memory")
    })
    .expect_err("GPU panic must be reported");
    assert!(error.to_string().contains("Out of Memory"));
}

#[test]
fn unknown_gpu_panic_has_a_readable_fallback() {
    assert_eq!(panic_message(&7_u8), "GPU operation panicked");
}

#[test]
fn preview_worker_uploads_a_shared_frame_without_camera_hardware() {
    use std::time::Instant;

    let instance = wgpu::Instance::default();
    let adapter =
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
            .expect("GPU adapter");
    let (device, queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
            .expect("GPU device");
    let supports_allocation_report = device.generate_allocator_report().is_some();
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = MediaSession::prepare(SessionConfig {
        screen: None,
        output_dir: temporary.path().join("session"),
        camera: CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("session");
    session.start().expect("start");
    let source = Arc::new(LatestFrame::new());
    let worker = PreviewWorker::start(
        device,
        queue,
        source.clone(),
        session.timeline(),
        Duration::from_millis(25),
    )
    .expect("preview worker");
    assert!(worker.gpu_memory_bytes().is_none());
    source.publish(VideoFrame {
        captured_ns: 0,
        width: 2,
        height: 2,
        data: CameraFrame {
            format: CameraFormat {
                width: 2,
                height: 2,
                fps: 30,
                pixel_format: PixelFormat::Bgra,
                stride: 8,
            },
            native_timestamp_ns: None,
            sequence: 1,
            data: Arc::from([0_u8; 16]),
        },
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    while worker.frames_uploaded() == 0 {
        assert!(
            Instant::now() < deadline,
            "preview worker did not upload the frame"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    if supports_allocation_report {
        assert!(worker.gpu_memory_bytes().is_some());
    }
    let outcome = worker.stop().expect("stop preview");
    assert!(outcome.error.is_none());
    let measurements = outcome.measurements;
    assert_eq!(measurements.synthetic_delay_ms, 25);
    assert_eq!(measurements.frames_uploaded, 1);
    assert_eq!(measurements.texture_recreations, 1);
    assert_eq!(measurements.cpu_color_conversion_bytes, 16);
    assert_eq!(measurements.cpu_padding_copy_count, 1);
    assert_eq!(measurements.cpu_padding_copy_bytes, 16);
    assert_eq!(measurements.bytes_uploaded, 512);
    session.stop().expect("stop session");
}
