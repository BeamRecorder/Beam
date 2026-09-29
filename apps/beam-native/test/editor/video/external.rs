//! Real GStreamer GPU export to the Argui Vulkan device, without a native window.
use super::*;
use beam_editor_engine::{EditorController, video::gpu::types::ExternalFrame};
use std::sync::{Arc, Mutex};

#[test]
#[cfg(target_os = "linux")]
#[ignore = "requires Vulkan DMA-BUF and an Intel VA decoder; no GUI"]
fn gstreamer_dmabuf_is_sampled_directly_by_argui_with_no_raster_upload() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("shared.webm");
    let result = std::process::Command::new("gst-launch-1.0")
        .args([
            "-q",
            "videotestsrc",
            "num-buffers=30",
            "pattern=green",
            "!",
            "video/x-raw,width=320,height=180,framerate=30/1",
            "!",
            "vp8enc",
            "deadline=1",
            "!",
            "webmmux",
            "!",
            "filesink",
            &format!("location={}", source.display()),
        ])
        .status()
        .unwrap();
    assert!(result.success());
    let root = tempfile::tempdir().unwrap();
    let controller = Arc::new(EditorController::new().unwrap());
    let mailbox = GpuCanvasMailbox::new();
    let verified = Arc::new(Mutex::new(0));
    let count = Arc::clone(&verified);
    let output = mailbox.clone();
    controller.set_frame_consumer(move |frame| {
        assert!(
            frame.rgba.is_empty(),
            "native GPU preview must not download pixels"
        );
        assert!(matches!(frame.external, Some(ExternalFrame::DmaBuf(_))));
        *count.lock().unwrap() += 1;
        output.publish(frame);
    });
    let registration = GpuCanvasRegistration::new(
        "test.shared",
        canvas::Factory::new(mailbox.clone(), Some(Arc::clone(&controller))),
    );
    mailbox.bind(&registration);
    let config = RendererConfig::default()
        .profiling(true)
        .gpu_canvases(GpuCanvasRegistry::new([registration.clone()]).unwrap());
    let mut renderer = pollster::block_on(SurfaceRenderer::new_offscreen(48, 48, config)).unwrap();
    controller.create(root.path().into(), "GPU".into()).unwrap();
    controller.import(vec![source]).unwrap();
    let scene = scene(&registration);
    let mut text = TextEngine::new();
    for time in [100, 600, 200, 900, 0, 600, 200] {
        controller.seek(time).unwrap();
        renderer
            .render_ui(&mut text, &PreparedText::default(), &scene, 1.)
            .unwrap();
        assert!(renderer.take_gpu_canvas_diagnostics().is_empty());
        assert_eq!(renderer.last_profile().adapter.backend, "Vulkan");
        assert_ne!(renderer.last_profile().adapter.device_type, "Cpu");
        let pixels = renderer.read_offscreen_rgba().unwrap();
        let center = pixel(&pixels, 24, 24);
        assert!(
            center[0] < 5 && center[1] > 250 && center[2] < 5 && center[3] == 255,
            "{center:?}"
        );
        assert_eq!(pixel(&pixels, 24, 2), &[34, 34, 34, 255]);
    }
    assert!(*verified.lock().unwrap() >= 7);
}
