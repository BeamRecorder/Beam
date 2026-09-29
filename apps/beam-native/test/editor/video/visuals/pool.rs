use super::{pool::Pool, types::Target};
use argui_render::GpuCanvasRegistry;
use beam_editor_engine::video::visuals::types::{Visual, VisualRequest};
use std::{collections::HashSet, sync::Arc};

#[test]
fn source_leases_only_expose_factories_registered_before_startup() {
    let pool = Pool::new();
    let registry = GpuCanvasRegistry::new(pool.registrations()).unwrap();
    assert_eq!(registry.len(), 256);
    let video = pool
        .acquire(&VisualRequest::Video { position_ms: 0 })
        .unwrap();
    let audio = pool
        .acquire(&VisualRequest::Audio {
            start_ms: 0,
            end_ms: 100,
            step_ms: 10,
        })
        .unwrap();
    for lease in [video, audio] {
        assert!(registry.get(lease.registration().id()).is_some());
    }
}

#[test]
fn source_slots_stay_unique_until_release_and_reuse_without_new_canvas_ids() {
    let pool = Pool::new();
    let request = VisualRequest::Video { position_ms: 0 };
    let leases: Vec<_> = (0..128).map(|_| pool.acquire(&request).unwrap()).collect();
    let ids: HashSet<_> = leases
        .iter()
        .map(|lease| lease.registration().id())
        .collect();
    assert_eq!(ids.len(), 128);
    assert!(pool.acquire(&request).is_err());
    // The other medium owns independent slots, even when every video slot is occupied.
    assert!(
        pool.acquire(&VisualRequest::Audio {
            start_ms: 0,
            end_ms: 10,
            step_ms: 1
        })
        .is_ok()
    );
    drop(leases);
    let first = pool.acquire(&request).unwrap();
    assert!(ids.contains(&first.registration().id()));
}

#[test]
fn shared_source_pixels_survive_one_view_read_and_are_cleared_before_slot_reuse() {
    let pool = Pool::new();
    let request = VisualRequest::Video { position_ms: 0 };
    let lease = pool.acquire(&request).unwrap();
    let target = lease.target();
    target.publish(&Visual::Video(super::super::frame(2, 2, [255, 0, 0, 255])));
    let Target::Video { mailbox, latest } = target else {
        panic!("video slot")
    };
    assert!(mailbox.take().is_some());
    let first = latest.lock().unwrap().clone().unwrap();
    let second = latest.lock().unwrap().clone().unwrap();
    assert!(Arc::ptr_eq(&first, &second));
    assert_eq!(second.rgba, [255, 0, 0, 255].repeat(4));
    drop(lease);
    assert!(latest.lock().unwrap().is_none());
    let lease = pool.acquire(&request).unwrap();
    let Target::Video { latest, .. } = lease.target() else {
        unreachable!()
    };
    assert!(latest.lock().unwrap().is_none());
}

#[test]
fn shared_waveforms_keep_the_latest_immutable_slice_and_clear_on_release() {
    let pool = Pool::new();
    let lease = pool
        .acquire(&VisualRequest::Audio {
            start_ms: 0,
            end_ms: 10,
            step_ms: 1,
        })
        .unwrap();
    let target = lease.target();
    target.publish(&Visual::Audio(
        beam_editor_engine::video::visuals::types::Waveform {
            start_ms: 0,
            duration_ms: 10,
            step_ms: 1,
            points: vec![[0.5; 5]],
            ready: vec![true],
        },
    ));
    let Target::Audio { mailbox, latest } = target else {
        panic!("audio slot")
    };
    assert!(mailbox.take().is_some());
    assert_eq!(latest.lock().unwrap().as_ref().unwrap().points[0], [0.5; 5]);
    drop(lease);
    assert!(latest.lock().unwrap().is_none());
}

#[test]
#[ignore = "requires hardware WGPU; no GUI window"]
fn shared_video_draws_in_both_views_and_reused_slots_do_not_keep_old_pixels() {
    let pool = Pool::new();
    let request = VisualRequest::Video { position_ms: 0 };
    let lease = pool.acquire(&request).unwrap();
    let id = lease.registration().id();
    let scene = double_scene(&lease.registration());
    let mut renderer = renderer(&pool);
    let mut text = argui_text::TextEngine::new();
    for color in [[255, 0, 0, 255], [0, 0, 255, 255]] {
        lease
            .target()
            .publish(&Visual::Video(super::super::frame(2, 2, color)));
        let pixels = render(&mut renderer, &mut text, &scene);
        for x in [12, 36] {
            assert_eq!(super::super::pixel(&pixels, x, 24), color);
        }
        assert_eq!(render(&mut renderer, &mut text, &scene), pixels);
        assert_eq!(renderer.gpu_canvas_stats().hits_this_frame, 2);
    }
    drop(lease);
    let pixels = render(&mut renderer, &mut text, &scene);
    for x in [12, 36] {
        assert_eq!(super::super::pixel(&pixels, x, 24), [34, 34, 34, 255]);
    }
    let lease = pool.acquire(&request).unwrap();
    assert_eq!(lease.registration().id(), id);
    lease
        .target()
        .publish(&Visual::Video(super::super::frame(2, 2, [0, 255, 0, 255])));
    let pixels = render(&mut renderer, &mut text, &scene);
    for x in [12, 36] {
        assert_eq!(super::super::pixel(&pixels, x, 24), [0, 255, 0, 255]);
    }
}

#[test]
#[ignore = "requires hardware WGPU; no GUI window"]
fn shared_waveform_draws_in_both_views_and_released_slots_become_blank() {
    let pool = Pool::new();
    let lease = pool
        .acquire(&VisualRequest::Audio {
            start_ms: 0,
            end_ms: 1000,
            step_ms: 10,
        })
        .unwrap();
    let scene = double_scene(&lease.registration());
    let mut renderer = renderer(&pool);
    let mut text = argui_text::TextEngine::new();
    let mut data = beam_editor_engine::video::visuals::types::Waveform {
        start_ms: 0,
        duration_ms: 1000,
        step_ms: 10,
        points: vec![[0.9, 0.8, 0.7, 0.6, 0.5]; 100],
        ready: vec![true; 100],
    };
    lease.target().publish(&Visual::Audio(data.clone()));
    let pixels = render(&mut renderer, &mut text, &scene);
    for x in [12, 36] {
        assert!((i32::from(super::super::pixel(&pixels, x, 44)[0]) - 89).abs() <= 1);
    }
    assert_eq!(render(&mut renderer, &mut text, &scene), pixels);
    assert_eq!(renderer.gpu_canvas_stats().hits_this_frame, 2);
    data.ready.fill(false);
    lease.target().publish(&Visual::Audio(data.clone()));
    let pending = render(&mut renderer, &mut text, &scene);
    for x in [12, 36] {
        assert_eq!(super::super::pixel(&pending, x, 44), [34, 34, 34, 255]);
    }
    data.ready.fill(true);
    lease.target().publish(&Visual::Audio(data));
    assert_eq!(render(&mut renderer, &mut text, &scene), pixels);
    drop(lease);
    let released = render(&mut renderer, &mut text, &scene);
    for x in [12, 36] {
        assert_eq!(super::super::pixel(&released, x, 44), [34, 34, 34, 255]);
    }
}

fn renderer(pool: &Pool) -> argui_render::SurfaceRenderer {
    let config = argui_render::RendererConfig::default()
        .profiling(true)
        .gpu_canvases(GpuCanvasRegistry::new(pool.registrations()).unwrap());
    pollster::block_on(argui_render::SurfaceRenderer::new_offscreen(48, 48, config)).unwrap()
}

fn double_scene(registration: &argui_render::GpuCanvasRegistration) -> argui_paint::DisplayList {
    use argui_core::{Affine2D, Point, Rect, Size};
    use argui_paint::{
        ClipChain, CornerRadii, GpuCanvasPrimitive, ImageSampling, ProfileDomain, RenderObjectId,
    };
    let mut scene = super::super::scene(registration);
    scene.push_gpu_canvas(GpuCanvasPrimitive {
        canvas: registration.id(),
        object: RenderObjectId::new(ProfileDomain::Ui, 2),
        slot: 0,
        bounds: Rect::new(Point::new(24., 0.), Size::new(24., 48.)),
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

fn render(
    renderer: &mut argui_render::SurfaceRenderer,
    text: &mut argui_text::TextEngine,
    scene: &argui_paint::DisplayList,
) -> Vec<u8> {
    renderer
        .render_ui(text, &argui_text::PreparedText::default(), scene, 1.)
        .unwrap();
    assert_ne!(renderer.last_profile().adapter.device_type, "Cpu");
    assert!(renderer.take_gpu_canvas_diagnostics().is_empty());
    renderer.read_offscreen_rgba().unwrap()
}
