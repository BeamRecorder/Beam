use beam_editor_engine::{
    Canvas,
    export::segment_streams::{audio_region, video_frame},
};

#[test]
fn shifted_native_grids_cover_global_frames_without_rounding_aliases() {
    let canvas = Canvas::default();
    for (next, start, duration) in [
        (25, 833_333_333, 16_666_667),
        (26, 850_000_000, 33_333_333),
        (27, 883_333_333, 33_333_333),
        (28, 916_666_666, 33_333_334),
        (29, 950_000_000, 33_333_333),
    ] {
        assert_eq!(
            video_frame(&canvas, start, duration, next, 60).unwrap(),
            Some(next)
        );
    }
    assert_eq!(
        video_frame(&canvas, 833_333_333, 16_666_667, 26, 60).unwrap(),
        None
    );
    assert!(
        video_frame(&canvas, 950_000_000, 33_333_333, 28, 60)
            .unwrap_err()
            .to_string()
            .contains("discontinuity")
    );
}

#[test]
fn real_holes_and_invalid_video_intervals_remain_errors() {
    let canvas = Canvas::default();
    assert_eq!(
        video_frame(&canvas, 100_000_001, 33_333_333, 3, 60).unwrap(),
        Some(3)
    );
    assert!(video_frame(&canvas, 100_000_002, 33_333_333, 3, 60).is_err());
    assert!(video_frame(&canvas, 0, 0, 0, 60).is_err());
    assert!(video_frame(&canvas, u64::MAX, 1, 0, 60).is_err());
    assert_eq!(video_frame(&canvas, 0, 10, 60, 60).unwrap(), None);
}
#[test]
fn overlapping_and_boundary_audio_buffers_are_shared_as_exact_regions() {
    assert_eq!(audio_region(40, 80, 45, 55).unwrap(), (Some(40..80), 50));
    assert_eq!(audio_region(45, 160, 50, 55).unwrap(), (Some(40..80), 55));
    assert_eq!(audio_region(40, 40, 45, 55).unwrap(), (None, 45));
}
#[test]
fn gaps_malformed_pcm_and_overflow_are_explicit_audio_errors() {
    assert!(
        audio_region(50, 80, 45, 60)
            .unwrap_err()
            .to_string()
            .contains("discontinuity")
    );
    assert!(audio_region(0, 7, 0, 10).is_err());
    assert!(audio_region(u64::MAX, 8, u64::MAX, u64::MAX).is_err());
}
