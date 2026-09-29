use beam_editor_engine::video::preview_lease;

#[test]
fn missing_and_mismatched_preview_producers_are_explicit_errors() {
    gst::init().unwrap();
    assert!(preview_lease::producer(&gst::Sample::builder().build()).is_err());
    let mut output = gst::Buffer::new();
    let mut input = gst::Buffer::new();
    assert!(preview_lease::bind(output.get_mut().unwrap(), input.clone()).is_err());
    output
        .get_mut()
        .unwrap()
        .set_pts(gst::ClockTime::from_mseconds(200));
    input.make_mut().set_pts(gst::ClockTime::from_mseconds(600));
    assert!(preview_lease::bind(output.get_mut().unwrap(), input.clone()).is_err());
    input.make_mut().set_pts(output.pts());
    assert!(preview_lease::bind(output.get_mut().unwrap(), input).is_err());
    let sample = gst::Sample::builder().buffer(&output).build();
    assert!(preview_lease::producer(&sample).is_err());
}

#[test]
fn sample_leases_survive_later_gl_frames_and_segment_metadata_copies() {
    use beam_editor_engine::video::{frame_gate_types::SegmentGate, gpu};
    use gst::prelude::*;
    crate::fixtures::context(|| {
        gpu::initialize().unwrap();
        let pipeline=gst::parse::launch("videotestsrc pattern=red ! video/x-raw,width=16,height=16,framerate=30/1 ! glupload ! glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! appsink name=sink").unwrap().downcast::<gst::Pipeline>().unwrap();
        pipeline.set_context(gpu::display_context());
        let sink = pipeline
            .by_name("sink")
            .unwrap()
            .downcast::<gst_app::AppSink>()
            .unwrap();
        pipeline.set_state(gst::State::Paused).unwrap();
        pipeline.state(gst::ClockTime::from_seconds(10)).0.unwrap();
        let producer = sink
            .try_pull_preroll(gst::ClockTime::from_seconds(10))
            .unwrap()
            .buffer()
            .unwrap()
            .to_owned();
        let mut output = gst::Buffer::new();
        output.get_mut().unwrap().set_pts(producer.pts());
        preview_lease::bind(output.get_mut().unwrap(), producer.clone()).unwrap();
        let seqnum = gst::Seqnum::next();
        let mut gate = SegmentGate::default();
        gate.observe(
            &gst::event::Segment::builder(&gst::FormattedSegment::<gst::ClockTime>::new())
                .seqnum(seqnum)
                .build(),
        );
        let copied = output.clone();
        gate.stamp(output.make_mut()).unwrap();
        let sample = gst::Sample::builder().buffer(&output).build();
        let leased = preview_lease::producer(&sample).unwrap();
        assert_eq!(leased.as_ptr(), producer.as_ptr());
        pipeline
            .seek_simple(
                gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                gst::ClockTime::from_mseconds(600),
            )
            .unwrap();
        pipeline.state(gst::ClockTime::from_seconds(10)).0.unwrap();
        let later = sink
            .try_pull_preroll(gst::ClockTime::from_seconds(10))
            .unwrap();
        assert_eq!(later.buffer().unwrap().pts().unwrap().mseconds(), 600);
        assert_eq!(
            preview_lease::producer(&sample).unwrap().pts(),
            producer.pts()
        );
        assert_eq!(
            preview_lease::producer(&gst::Sample::builder().buffer(&copied).build())
                .unwrap()
                .as_ptr(),
            producer.as_ptr()
        );
        pipeline.set_state(gst::State::Null).unwrap();
    });
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "requires actual EGL DMA-BUF texture export"]
fn external_native_seeks_lease_the_producer_for_each_actual_sample() {
    use beam_editor_engine::{
        EditorController,
        video::gpu::types::{ExternalFrame, PreviewTransport},
    };
    use std::sync::{Arc, Mutex};
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller.set_preview_transport(PreviewTransport::DmaBuf);
    let delivered = Arc::new(Mutex::new(None));
    let output = delivered.clone();
    controller.set_frame_consumer(move |frame| *output.lock().unwrap() = Some(frame));
    controller
        .create(root.path().into(), "External sample leases".into())
        .unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "external.webm",
            false,
        )])
        .unwrap();
    let mut held = vec![];
    for position in [600, 100, 600, 200] {
        delivered.lock().unwrap().take();
        controller.seek(position).unwrap();
        let frame = delivered.lock().unwrap().take().unwrap();
        assert_eq!(frame.position_ms, position);
        assert!(frame.rgba.is_empty());
        let ExternalFrame::DmaBuf(image) = frame.external.unwrap();
        assert_eq!(image.producer().pts().unwrap().mseconds(), position);
        image.descriptor().unwrap();
        held.push((position, image));
    }
    for (position, image) in held {
        assert_eq!(image.producer().pts().unwrap().mseconds(), position);
    }
}
