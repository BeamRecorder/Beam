use beam_editor_engine::video::frame_gate_types::SegmentGate;

fn segment(seqnum: gst::Seqnum) -> gst::Event {
    gst::event::Segment::builder(&gst::FormattedSegment::<gst::ClockTime>::new())
        .seqnum(seqnum)
        .build()
}

#[test]
fn seek_accepts_only_its_segment_and_rejects_inflight_frames_at_the_same_timestamp() {
    gst::init().unwrap();
    let old = gst::Seqnum::next();
    let next = gst::Seqnum::next();
    let mut gate = SegmentGate::default();
    assert!(gate.accepts(None));
    gate.observe(&segment(old));
    assert!(gate.accepts(Some(old)));
    gate.expect(next);
    assert!(!gate.accepts(Some(old)));
    assert!(!gate.accepts(None));
    gate.observe(&segment(next));
    assert_eq!(gate.active(), Some(next));
    assert!(gate.accepts(Some(next)));
    assert!(
        !gate.accepts(Some(old)),
        "a callback captured before Segment remains stale"
    );
    gate.observe(&gst::event::FlushStart::new());
    assert!(!gate.accepts(Some(next)));
    gate.observe(&gst::event::FlushStop::new(true));
    assert!(!gate.accepts(None));
    gate.observe(&gst::event::StreamStart::new("native-stream"));
    assert!(!gate.accepts(None));
    gate.observe(&segment(next));
    assert!(gate.accepts(Some(next)));
    let later = gst::Seqnum::next();
    gate.expect(later);
    gate.observe(&segment(old));
    assert!(!gate.accepts(Some(old)));
    gate.observe(&segment(later));
    assert!(gate.accepts(Some(later)));
}

#[test]
fn a_real_buffer_keeps_its_old_segment_after_a_new_seek_at_the_same_pts() {
    gst::init().unwrap();
    let old = gst::Seqnum::next();
    let next = gst::Seqnum::next();
    let mut gate = SegmentGate::default();
    let mut before_segment = gst::Buffer::new();
    assert!(gate.stamp(before_segment.get_mut().unwrap()).is_err());
    gate.observe(&segment(old));
    let mut buffer = gst::Buffer::new();
    buffer
        .get_mut()
        .unwrap()
        .set_pts(gst::ClockTime::from_mseconds(600));
    gate.stamp(buffer.get_mut().unwrap()).unwrap();
    assert_eq!(gate.marker(&buffer), Some(old));
    gate.expect(next);
    assert!(!gate.accepts(gate.marker(&buffer)));
    gate.observe(&segment(next));
    assert_eq!(gate.marker(&buffer), None);
    gate.stamp(buffer.get_mut().unwrap()).unwrap();
    assert_eq!(
        gate.marker(&buffer),
        None,
        "a delayed sample cannot be relabelled"
    );
    let mut fresh = gst::Buffer::new();
    fresh.get_mut().unwrap().set_pts(buffer.pts());
    gate.stamp(fresh.get_mut().unwrap()).unwrap();
    assert_eq!(fresh.pts(), buffer.pts());
    assert!(gate.accepts(gate.marker(&fresh)));
    assert!(!gate.accepts(gate.marker(&gst::Buffer::new())));
}

#[test]
fn the_first_seek_after_a_cut_and_later_out_of_order_seeks_use_the_whole_timeline() {
    use super::effects::types::Render;
    use ges::prelude::*;
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let project = super::transitions::project(root.path(), media.path());
        let render = Render::new(root.path(), &project);
        assert_eq!(
            render.pipeline.timeline().unwrap().duration(),
            gst::ClockTime::from_mseconds(2000)
        );
        // Initial NLE preroll stops at 800 ms, before this A/B transition.
        let first = render.image(1000);
        assert_eq!(first.position_ms, 1000);
        let pixel = |image: &beam_editor_engine::PreviewFrame| -> [u8; 4] {
            let index = ((image.height / 2 * image.width + image.width / 2) * 4) as usize;
            image.rgba[index..index + 4].try_into().unwrap()
        };
        assert!(
            (i16::from(pixel(&first)[0]) - 128).abs() <= 15
                && (i16::from(pixel(&first)[2]) - 128).abs() <= 15,
            "the first seek reaches both transition inputs: {:?}",
            pixel(&first)
        );
        for time in [1400, 200, 1000, 600, 1400, 1000] {
            let frame = render.image(time);
            assert_eq!(frame.position_ms, time);
            if time == 1000 {
                assert_eq!(frame.rgba, first.rgba, "out-of-order transition seek");
            } else if time < 800 {
                assert!(pixel(&frame)[0] > 240 && pixel(&frame)[2] < 10);
            } else {
                assert!(pixel(&frame)[2] > 240 && pixel(&frame)[0] < 10);
            }
        }
    });
}

#[test]
fn one_hundred_real_effects_preserve_out_of_order_seeks_forwarding_and_same_time_updates() {
    use super::effects::{definition, types::Render};
    use beam_editor_domain::animation::{Binding, Value};
    use beam_editor_engine::video::{pipeline, probe, types::FrameMailbox};
    use ges::prelude::*;
    use std::{sync::Arc, time::Duration};
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let asset = probe::import(
            root.path(),
            &crate::fixtures::media(media.path(), "gated.webm", false),
        )
        .unwrap();
        let mut project = crate::fixtures::project();
        project.canvas.width = 64;
        project.canvas.height = 36;
        let mut clip = super::clip_mut(&mut project, 0);
        clip.asset_id = asset.id;
        clip.duration_ms = asset.duration_ms;
        drop(clip);
        project.assets = vec![asset];
        for _ in 0..100 {
            let mut instance = definition(&project, "beam.opacity").instantiate();
            instance
                .parameters
                .insert("opacity".into(), Binding::constant(Value::Number(0.995)));
            super::clip_mut(&mut project, 0).instances.push(instance);
        }
        let render = Render::new(root.path(), &project);
        let expected: Vec<_> = [100, 200, 600]
            .into_iter()
            .map(|time| (time, render.image(time).rgba))
            .collect();
        let target = Arc::new(FrameMailbox::default());
        render.frames.forward_to(&target);
        let seek = |time| {
            target.clear();
            render
                .frames
                .seek(&render.pipeline, gst::ClockTime::from_mseconds(time), 30, 1)
                .unwrap();
            let (result, current, pending) =
                render.pipeline.state(gst::ClockTime::from_seconds(10));
            result.unwrap();
            assert_eq!(
                (current, pending),
                (gst::State::Paused, gst::State::VoidPending)
            );
            render.frames.wait(Duration::from_secs(10)).unwrap();
            assert!(
                render.frames.take().is_none(),
                "forwarding retains no extra raster"
            );
            target.take().expect("native forwarded frame")
        };
        for time in [600, 200, 600, 100, 600, 100, 200] {
            let frame = seek(time);
            assert_eq!(frame.position_ms, time);
            let reference = &expected.iter().find(|(at, _)| *at == time).unwrap().1;
            let changes: Vec<_> = frame
                .rgba
                .iter()
                .zip(reference)
                .enumerate()
                .filter(|(_, (a, b))| a != b)
                .collect();
            let max = changes
                .iter()
                .map(|(_, (a, b))| a.abs_diff(**b))
                .max()
                .unwrap_or(0);
            assert!(
                changes.is_empty(),
                "seek {time}: {} changed bytes, max {max}, first {:?}",
                changes.len(),
                changes.first()
            );
        }
        let mut changed = project.clone();
        super::clip_mut(&mut changed, 0).instances[0]
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
        pipeline::prepare_update(&render.pipeline, &project, &changed)
            .unwrap()
            .unwrap()
            .apply();
        assert_ne!(
            seek(600).rgba,
            expected[2].1,
            "the same timestamp receives the newly evaluated effects"
        );
        pipeline::prepare_update(&render.pipeline, &changed, &project)
            .unwrap()
            .unwrap()
            .apply();
        assert_eq!(seek(600).rgba, expected[2].1);
    });
}

#[cfg(target_os = "linux")]
#[test]
fn the_hardware_decoder_returns_identical_source_pixels_after_out_of_order_seeks() {
    use beam_editor_engine::video::gpu;
    use ges::prelude::*;
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let source = crate::fixtures::media(media.path(), "decoder.webm", false);
        gpu::initialize().unwrap();
        let pipeline = gst::parse::launch(&format!("filesrc location=\"{}\" ! matroskademux ! beamglvavp8dec ! gldownload ! video/x-raw,format=RGBA ! appsink name=sink", source.display())).unwrap().downcast::<gst::Pipeline>().unwrap();
        pipeline.set_context(gpu::display_context());
        let sink = pipeline
            .by_name("sink")
            .unwrap()
            .downcast::<gst_app::AppSink>()
            .unwrap();
        pipeline.set_state(gst::State::Paused).unwrap();
        pipeline.state(gst::ClockTime::from_seconds(10)).0.unwrap();
        let image = |time| {
            pipeline
                .seek_simple(
                    gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                    gst::ClockTime::from_mseconds(time),
                )
                .unwrap();
            pipeline.state(gst::ClockTime::from_seconds(10)).0.unwrap();
            let sample = sink
                .try_pull_preroll(gst::ClockTime::from_seconds(10))
                .unwrap();
            let buffer = sample.buffer().unwrap();
            let pts = buffer.pts().unwrap().mseconds();
            (pts, buffer.map_readable().unwrap().as_slice().to_vec())
        };
        let expected: Vec<_> = [100, 200, 600]
            .into_iter()
            .map(|time| (time, image(time)))
            .collect();
        let mut failures = Vec::new();
        for time in [600, 200, 600, 100, 600, 100, 200] {
            let (pts, actual) = image(time);
            let (_, (expected_pts, reference)) =
                expected.iter().find(|(at, _)| *at == time).unwrap();
            assert_eq!(pts, *expected_pts);
            let changes: Vec<_> = actual
                .iter()
                .zip(reference)
                .enumerate()
                .filter(|(_, (a, b))| a != b)
                .collect();
            let max = changes
                .iter()
                .map(|(_, (a, b))| a.abs_diff(**b))
                .max()
                .unwrap_or(0);
            if !changes.is_empty() {
                failures.push(format!(
                    "source seek {time}: {} changed bytes max{max}, first{:?}",
                    changes.len(),
                    changes.first()
                ));
            }
        }
        pipeline.set_state(gst::State::Null).unwrap();
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    });
}
