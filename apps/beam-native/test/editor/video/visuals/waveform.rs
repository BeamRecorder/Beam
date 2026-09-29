use super::waveform::Factory;
use argui_render::{
    GpuCanvasMailbox, GpuCanvasRegistration, GpuCanvasRegistry, RendererConfig, SurfaceRenderer,
};
use argui_text::{PreparedText, TextEngine};
use beam_editor_engine::video::visuals::types::Waveform;

#[test]
#[ignore = "requires hardware WGPU; no GUI window"]
fn blick_shader_renders_four_envelopes_keeps_pending_blank_and_reuses_gpu_resources() {
    let mailbox = GpuCanvasMailbox::new();
    let pipelines = Default::default();
    let registration = GpuCanvasRegistration::new(
        "test.blick",
        Factory {
            mailbox: mailbox.clone(),
            pipelines: std::sync::Arc::clone(&pipelines),
        },
    );
    mailbox.bind(&registration);
    let config = RendererConfig::default()
        .profiling(true)
        .gpu_canvases(GpuCanvasRegistry::new([registration.clone()]).unwrap());
    let mut renderer = pollster::block_on(SurfaceRenderer::new_offscreen(48, 48, config)).unwrap();
    let scene = super::super::scene(&registration);
    let mut text = TextEngine::new();
    let data = Waveform {
        start_ms: 0,
        duration_ms: 1000,
        step_ms: 10,
        points: vec![[0.9, 0.8, 0.7, 0.6, 0.5]; 100],
        ready: vec![true; 100],
    };
    mailbox.publish(data.clone());
    renderer
        .render_ui(&mut text, &PreparedText::default(), &scene, 1.)
        .unwrap();
    let first = renderer.read_offscreen_rgba().unwrap();
    assert!(renderer.take_gpu_canvas_diagnostics().is_empty());
    assert_ne!(renderer.last_profile().adapter.device_type, "Cpu");
    let color = |y| super::super::pixel(&first, 24, y)[0];
    for (y, expected) in [(44, 89_i32), (32, 144), (21, 196), (10, 244)] {
        assert!(
            (i32::from(color(y)) - expected).abs() <= 1,
            "Blick layer at {y}: {}",
            color(y)
        );
    }
    renderer
        .render_ui(&mut text, &PreparedText::default(), &scene, 1.)
        .unwrap();
    assert_eq!(renderer.gpu_canvas_stats().hits_this_frame, 1);
    assert_eq!(renderer.read_offscreen_rgba().unwrap(), first);
    let mut pending = data.clone();
    pending.ready.fill(false);
    mailbox.publish(pending);
    renderer
        .render_ui(&mut text, &PreparedText::default(), &scene, 1.)
        .unwrap();
    let pixels = renderer.read_offscreen_rgba().unwrap();
    assert_eq!(super::super::pixel(&pixels, 24, 44), &[34, 34, 34, 255]);
    let mut invalid = data;
    invalid.points.clear();
    mailbox.publish(invalid);
    renderer
        .render_ui(&mut text, &PreparedText::default(), &scene, 1.)
        .unwrap();
    assert!(
        renderer.take_gpu_canvas_diagnostics()[0]
            .message
            .contains("waveform")
    );
}
