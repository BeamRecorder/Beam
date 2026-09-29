use beam_editor_engine::video::seek::rounding_fragment;

#[test]
fn only_discontinuous_sub_millisecond_rounding_fragments_are_dropped() {
    gst::init().unwrap();
    let mut buffer = gst::Buffer::new();
    assert!(!rounding_fragment(&buffer));
    buffer
        .get_mut()
        .unwrap()
        .set_flags(gst::BufferFlags::DISCONT);
    assert!(!rounding_fragment(&buffer));
    for duration in [0, 333_333, 999_999] {
        buffer
            .get_mut()
            .unwrap()
            .set_duration(gst::ClockTime::from_nseconds(duration));
        assert!(rounding_fragment(&buffer));
    }
    for duration in [1_000_000, 33_333_333] {
        buffer
            .get_mut()
            .unwrap()
            .set_duration(gst::ClockTime::from_nseconds(duration));
        assert!(!rounding_fragment(&buffer));
    }
    buffer
        .get_mut()
        .unwrap()
        .set_duration(gst::ClockTime::from_nseconds(333_333));
    buffer
        .get_mut()
        .unwrap()
        .unset_flags(gst::BufferFlags::DISCONT);
    assert!(!rounding_fragment(&buffer));
}
