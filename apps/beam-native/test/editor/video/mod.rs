//! Offscreen GPU checks; no native windows are created.
#[path = "../../../src/editor/video/canvas.rs"]
mod canvas;
#[path = "../../../src/editor/video/external.rs"]
mod external;
#[path = "../../../src/editor/video/resources.rs"]
mod resources;
#[path = "external.rs"]
mod shared_frames;
#[path = "../../../src/editor/video/types.rs"]
mod types;
use argui_core::{Affine2D, Color, Point, Rect, Size};
use argui_paint::{
    Border, ClipChain, CornerRadii, DisplayList, Fill, GpuCanvasPrimitive, ImageSampling,
    ProfileDomain, Quad, RenderObjectId,
};
use argui_render::{
    GpuCanvasMailbox, GpuCanvasRegistration, GpuCanvasRegistry, RendererConfig, SurfaceRenderer,
};
use argui_text::{PreparedText, TextEngine};
use beam_editor_engine::PreviewFrame;

fn frame(width: u32, height: u32, color: [u8; 4]) -> PreviewFrame {
    PreviewFrame {
        sequence: 1,
        position_ms: 0,
        width,
        height,
        rgba: color.repeat((width * height) as usize),
        external: None,
    }
}
fn pixel(bytes: &[u8], x: usize, y: usize) -> &[u8] {
    &bytes[(y * 48 + x) * 4..(y * 48 + x + 1) * 4]
}

#[test]
#[ignore = "requires a hardware WGPU adapter; uses no GUI"]
fn native_gpu_viewport_keeps_latest_frame_aspect_reuses_textures_and_recovers() {
    let mailbox = GpuCanvasMailbox::new();
    let registration =
        GpuCanvasRegistration::new("test.preview", canvas::Factory::new(mailbox.clone(), None));
    mailbox.bind(&registration);
    let config = RendererConfig::default()
        .profiling(true)
        .gpu_canvases(GpuCanvasRegistry::new([registration.clone()]).unwrap());
    let mut renderer = pollster::block_on(SurfaceRenderer::new_offscreen(48, 48, config)).unwrap();
    let scene = scene(&registration);
    mailbox.publish(frame(16, 8, [255, 0, 0, 255]));
    mailbox.publish(frame(16, 8, [0, 255, 0, 255]));
    let mut text = TextEngine::new();
    let mut render = |renderer: &mut SurfaceRenderer| {
        renderer
            .render_ui(&mut text, &PreparedText::default(), &scene, 1.)
            .unwrap();
        assert_ne!(renderer.last_profile().adapter.device_type, "Cpu");
        renderer.read_offscreen_rgba().unwrap()
    };
    let first = render(&mut renderer);
    assert_eq!(pixel(&first, 24, 24), &[0, 255, 0, 255]);
    assert_eq!(pixel(&first, 24, 2), &[34, 34, 34, 255]);
    assert!(renderer.take_gpu_canvas_diagnostics().is_empty());
    assert_eq!(render(&mut renderer), first);
    assert_eq!(renderer.gpu_canvas_stats().hits_this_frame, 1);

    mailbox.publish(frame(8, 16, [0, 0, 255, 255]));
    let portrait = render(&mut renderer);
    assert_eq!(pixel(&portrait, 24, 24), &[0, 0, 255, 255]);
    assert_eq!(pixel(&portrait, 2, 24), &[34, 34, 34, 255]);

    mailbox.publish(PreviewFrame {
        sequence: 2,
        position_ms: 0,
        width: 0,
        height: 8,
        rgba: vec![],
        external: None,
    });
    render(&mut renderer);
    assert!(
        renderer.take_gpu_canvas_diagnostics()[0]
            .message
            .contains("dimensions")
    );
    mailbox.publish(frame(8, 16, [0, 0, 255, 255]));
    assert_eq!(render(&mut renderer), portrait);
    assert_eq!(renderer.take_gpu_canvas_diagnostics().len(), 1);
}

fn scene(registration: &GpuCanvasRegistration) -> DisplayList {
    let mut scene = DisplayList::new();
    scene.push_quad(Quad {
        bounds: Rect::new(Point::default(), Size::new(48., 48.)),
        background: Some(Fill::Solid(Color::from_hex("#222222").unwrap())),
        border: Border::all(0., Color::TRANSPARENT),
        radii: CornerRadii::default(),
        opacity: 1.,
        transform: Affine2D::IDENTITY,
        clips: ClipChain::default(),
    });
    scene.push_gpu_canvas(GpuCanvasPrimitive {
        canvas: registration.id(),
        object: RenderObjectId::new(ProfileDomain::Ui, 1),
        slot: 0,
        bounds: Rect::new(Point::default(), Size::new(48., 48.)),
        content_revision: 0,
        resolution_scale: 1.,
        sampling: ImageSampling::Linear,
        opacity: 1.,
        radii: CornerRadii::default(),
        transform: Affine2D::IDENTITY,
        clips: ClipChain::default(),
    });
    scene
}

mod visuals;
