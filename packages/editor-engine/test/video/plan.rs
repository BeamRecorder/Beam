use beam_editor_engine::video::{pipeline, plan_types::RenderPlan, preview, types::FrameMailbox};
use ges::prelude::*;
use std::{sync::Arc, time::Duration};

#[test]
fn ten_thousand_document_clips_allocate_only_the_active_native_window() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        let original = crate::video::clip_mut(&mut project, 0).clone();
        project.clips = Default::default();
        for i in 0..10_000 {
            let mut clip = original.clone();
            clip.id = uuid::Uuid::new_v4();
            clip.start_ms = i * 1_000;
            clip.generator = clip.generator.map(|i| i.duplicate());
            project.clips.try_push(clip).unwrap();
        }
        let mut payloads = std::collections::HashMap::new();
        let pages = (0..project.clips.page_count())
            .map(|page| {
                let hash = format!("{page:064x}");
                payloads.insert(hash.clone(), project.clips.try_page_values(page).unwrap());
                beam_editor_domain::collections::LazyPage {
                    hash,
                    headers: project
                        .clips
                        .page_headers(page)
                        .unwrap()
                        .into_iter()
                        .map(|header| header.as_ref().clone())
                        .collect(),
                }
            })
            .collect();
        project.clips = beam_editor_domain::collections::PersistentCollection::from_lazy(
            pages,
            Arc::new(move |hash| Ok(payloads.get(hash).unwrap().clone())),
        )
        .unwrap();
        let playhead = 5_000_200;
        assert_eq!(project.clips.loaded_pages(), 0);
        assert!(RenderPlan::preview(&project, playhead).unwrap().clips.len() <= 41);
        assert_eq!(
            project.clips.loaded_pages(),
            0,
            "scheduling loads headers only"
        );
        let pipeline = pipeline::build_preview(root.path(), &project, playhead).unwrap();
        assert!(
            project.clips.loaded_pages() <= 2,
            "only pages covering the active sources load"
        );
        let plan = pipeline::render_plan(&pipeline).unwrap();
        assert!(
            plan.clips.len() <= 41,
            "native allocation follows the active window: {}",
            plan.clips.len()
        );
        let nodes = pipeline
            .timeline()
            .unwrap()
            .layers()
            .iter()
            .flat_map(|l| l.clips())
            .filter(|n| n.name().is_some_and(|name| name.starts_with("clip-")))
            .count();
        assert_eq!(nodes, plan.clips.len());
        assert_eq!(project.clips.len(), 10_000);
        let frames = Arc::new(FrameMailbox::default());
        preview::attach(&pipeline, &project.canvas, frames.clone()).unwrap();
        pipeline.set_state(gst::State::Paused).unwrap();
        frames.wait(Duration::from_secs(10)).unwrap();
        frames.expect_position(playhead, 30);
        pipeline
            .seek_simple(
                gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                gst::ClockTime::from_mseconds(playhead),
            )
            .unwrap();
        frames.wait(Duration::from_secs(10)).unwrap();
        let frame = frames.take().unwrap();
        assert!(
            frame.position_ms >= playhead && frame.rgba[(32 * 64 + 32) * 4] > 240,
            "absolute frame clock and artwork survive scheduling"
        );
        let mut after = project.clone();
        crate::video::clip_mut(&mut after, 5_000).effects.opacity = 0.5;
        let update = pipeline::prepare_update(&pipeline, &project, &after)
            .unwrap()
            .unwrap();
        update.apply();
        assert_eq!(pipeline::render_plan(&pipeline).unwrap().clips.len(), nodes);
        pipeline.set_state(gst::State::Null).unwrap();
    });
}

#[test]
fn a_window_crossing_the_cut_includes_both_real_media_handles() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let project = super::transitions::project(root.path(), media.path());
        let plan = RenderPlan::range(&project, 1_050, 1_080).unwrap();
        assert_eq!(plan.clips.len(), 2);
        assert_eq!(plan.transitions.len(), 1);
        let pipeline = pipeline::build_window(root.path(), &project, 1_050, 1_080).unwrap();
        let frames = Arc::new(FrameMailbox::default());
        preview::attach(&pipeline, &project.canvas, frames.clone()).unwrap();
        pipeline.preview_set_audio_sink(Some(
            &gst::ElementFactory::make("fakesink").build().unwrap(),
        ));
        pipeline.set_state(gst::State::Paused).unwrap();
        frames.wait(Duration::from_secs(10)).unwrap();
        frames.expect_position(1_050, 30);
        pipeline
            .seek_simple(
                gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                gst::ClockTime::from_mseconds(1_050),
            )
            .unwrap();
        frames.wait(Duration::from_secs(10)).unwrap();
        let frame = frames.take().unwrap();
        let pixel = &frame.rgba[(32 * 64 + 32) * 4..(32 * 64 + 32) * 4 + 3];
        assert!(
            pixel[0] > 40 && pixel[2] > 40,
            "the incoming-only logical interval still needs the outgoing handle: {pixel:?}"
        );
        pipeline.set_state(gst::State::Null).unwrap();
    });
}
