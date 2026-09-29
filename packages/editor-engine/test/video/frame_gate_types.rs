use beam_editor_engine::video::frame_gate_types::SegmentGate;

#[test]
fn a_new_gate_has_no_requested_or_observed_segment() {
    let gate = SegmentGate::default();
    assert_eq!(gate.active(), None);
    assert!(gate.accepts(None));
    gst::init().unwrap();
    assert!(!gate.accepts(Some(gst::Seqnum::next())));
}

#[test]
fn preview_seek_rejects_invalid_clocks_and_a_pipeline_without_a_timeline() {
    use beam_editor_engine::{PreviewFrame, video::types::FrameMailbox};
    gst::init().unwrap();
    ges::init().unwrap();
    let pipeline = ges::Pipeline::new();
    let frames = FrameMailbox::default();
    let frame = || PreviewFrame {
        sequence: 1,
        position_ms: 0,
        width: 1,
        height: 1,
        rgba: vec![255; 4],
        external: None,
    };
    for (position, numerator, denominator) in [
        (gst::ClockTime::ZERO, 0, 1),
        (gst::ClockTime::ZERO, 30, 0),
        (gst::ClockTime::MAX, 30, 1),
    ] {
        frames.publish(frame());
        assert!(
            frames
                .seek(&pipeline, position, numerator, denominator)
                .is_err()
        );
        assert!(
            frames.take().is_some(),
            "invalid input does not arm or clear a seek"
        );
    }
    assert!(frames.seek(&pipeline, gst::ClockTime::ZERO, 30, 1).is_err());
    frames.publish(frame());
    assert!(
        frames.take().is_some(),
        "a missing timeline is rejected before arming a seek"
    );
}

#[test]
fn preview_seek_rejects_positions_beyond_the_prepared_timeline_before_arming_its_gate() {
    use beam_editor_engine::{
        PreviewFrame,
        video::{pipeline, types::FrameMailbox},
    };
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let pipeline = pipeline::build(root.path(), &super::effects::project()).unwrap();
        let frames = FrameMailbox::default();
        frames.publish(PreviewFrame {
            sequence: 42,
            position_ms: 600,
            width: 1,
            height: 1,
            rgba: vec![255; 4],
            external: None,
        });
        assert!(
            frames
                .seek(&pipeline, gst::ClockTime::from_mseconds(1001), 30, 1)
                .is_err()
        );
        assert_eq!(
            frames.take().unwrap().sequence,
            42,
            "an invalid timeline position preserves the accepted frame"
        );
    });
}
