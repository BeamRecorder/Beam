use beam_editor_engine::{
    Canvas,
    export::{segment_schedule::schedule, segment_types::SegmentPolicy},
};
#[test]
fn fractional_frame_and_audio_clocks_are_contiguous_through_all_segments() {
    let canvas = Canvas {
        fps: 30_000,
        fps_denominator: 1001,
        ..Default::default()
    };
    let segments = schedule(&canvas, 21_000, SegmentPolicy::default()).unwrap();
    assert_eq!(segments.first().unwrap().start_frame, 0);
    assert_eq!(segments.last().unwrap().end_frame, 630);
    assert_eq!(segments.last().unwrap().end_audio, 21_000 * 48);
    for pair in segments.windows(2) {
        assert_eq!(pair[0].end_frame, pair[1].start_frame);
        assert_eq!(pair[0].end_ns, pair[1].start_ns);
        assert_eq!(pair[0].end_audio, pair[1].start_audio);
    }
}
#[test]
fn partial_final_frames_and_one_frame_windows_preserve_full_duration() {
    let canvas = Canvas::default();
    let segments = schedule(
        &canvas,
        101,
        SegmentPolicy {
            window_ms: 1,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(segments.len(), 4);
    assert_eq!(segments.last().unwrap().end_ns, 101_000_000);
    assert_eq!(segments.last().unwrap().end_audio, 4848);
}
#[test]
fn invalid_clocks_and_duration_budgets_fail_before_native_allocation() {
    for (canvas, duration, window) in [
        (Canvas::default(), 0, 1000),
        (Canvas::default(), 1000, 0),
        (
            Canvas {
                fps: 0,
                ..Default::default()
            },
            1000,
            1000,
        ),
        (
            Canvas {
                fps_denominator: 0,
                ..Default::default()
            },
            1000,
            1000,
        ),
        (Canvas::default(), u64::MAX, 1000),
    ] {
        assert!(
            schedule(
                &canvas,
                duration,
                SegmentPolicy {
                    window_ms: window,
                    ..Default::default()
                }
            )
            .is_err()
        );
    }
}

#[test]
fn dense_source_windows_adapt_to_headers_and_keep_the_entire_document() {
    let mut project = crate::video::effects::project();
    let template = crate::video::clip(&project, 0);
    project.clips = Default::default();
    for index in 0..10_000 {
        let mut clip = (*template).clone();
        clip.id = uuid::Uuid::new_v4();
        clip.start_ms = index * 20;
        clip.duration_ms = 20;
        project.clips.try_push(clip).unwrap();
    }
    let segments = beam_editor_engine::export::segment_schedule::for_project(
        &project,
        SegmentPolicy::default(),
    )
    .unwrap();
    assert!(
        segments.len() > 20,
        "dense windows shrink below ten seconds"
    );
    assert_eq!(segments.first().unwrap().start_frame, 0);
    assert_eq!(segments.last().unwrap().end_frame, 6000);
    assert_eq!(segments.last().unwrap().end_audio, 9_600_000);
    for segment in &segments {
        let plan = beam_editor_engine::video::plan_types::RenderPlan::range(
            &project,
            segment.start_ns / 1_000_000,
            segment.end_ns.div_ceil(1_000_000),
        )
        .unwrap();
        assert!(plan.clips.len() <= SegmentPolicy::default().target_native_clips);
    }
    assert_eq!(project.clips.len(), 10_000);
}

#[test]
fn a_single_frame_above_the_allocation_target_keeps_every_source() {
    let mut project = crate::video::effects::project();
    let template = crate::video::clip(&project, 0);
    project.clips = Default::default();
    for _ in 0..3 {
        let mut clip = (*template).clone();
        clip.id = uuid::Uuid::new_v4();
        project.clips.try_push(clip).unwrap();
    }
    let segments = beam_editor_engine::export::segment_schedule::for_project(
        &project,
        SegmentPolicy {
            target_native_clips: 2,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(segments.len(), 30);
    assert!(
        segments
            .iter()
            .all(|segment| segment.end_frame == segment.start_frame + 1)
    );
    assert_eq!(project.clips.len(), 3);
}
