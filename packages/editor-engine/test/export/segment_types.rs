use beam_editor_engine::export::segment_types::SegmentPolicy;
#[test]
fn the_job_preloads_ten_second_source_windows_by_default() {
    assert_eq!(SegmentPolicy::default().window_ms, 10_000);
    assert_eq!(SegmentPolicy::default().target_native_clips, 128);
}
