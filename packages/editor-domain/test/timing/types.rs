use beam_editor_domain::{
    Clip, Project, TrackKind,
    timing::{FrameRate, Rate, Time, TimeRange, TimeSpace, map_time},
};
use uuid::Uuid;

#[test]
fn fractional_frame_rate_keeps_rational_time_until_backend_rounding() {
    let fps = FrameRate {
        numerator: 30_000,
        denominator: 1_001,
    };
    let frame = fps.time_at_frame(30_000).unwrap();
    assert_eq!(
        frame,
        Time {
            ticks: 30_030_000,
            timescale: 30_000
        }
    );
    assert_eq!(frame.seconds(), 1_001.);
    assert_eq!(frame.rescale(1_000).unwrap(), Time::milliseconds(1_001_000));
    assert!(
        FrameRate {
            numerator: 0,
            denominator: 1
        }
        .time_at_frame(1)
        .is_err()
    );
}

#[test]
fn time_ranges_are_half_open_and_reject_empty_or_zero_scale() {
    let range = TimeRange {
        space: TimeSpace::Sequence,
        start: Time::milliseconds(10),
        end: Time::milliseconds(20),
    };
    assert!(range.validate().is_ok());
    assert!(range.contains(Time::milliseconds(10)));
    assert!(!range.contains(Time::milliseconds(20)));
    assert!(
        TimeRange {
            end: Time::milliseconds(10),
            ..range
        }
        .validate()
        .is_err()
    );
    assert!(Time::milliseconds(1).rescale(0).is_err());
}

#[test]
fn source_time_mapping_respects_rational_retime_and_clip_offset() {
    let project = Project::new("mapping".into());
    let asset = crate::fixtures::asset(10_000);
    let clip = Clip {
        id: Uuid::new_v4(),
        asset_id: asset.id,
        track_id: project
            .tracks
            .headers()
            .find(|t| t.kind == TrackKind::Video)
            .unwrap()
            .id,
        start_ms: 2_000,
        source_in_ms: 1_000,
        duration_ms: 4_000,
        effects: Default::default(),
        cursor_style: None,
        title: None,
        instances: vec![],
        rate: Rate {
            numerator: 3,
            denominator: 2,
        },
        animation_offset_ms: 100,
        generator: None,
        link_group: None,
    };
    let sequence = Time::milliseconds(3_000);
    assert_eq!(
        map_time(&clip, sequence, TimeSpace::Sequence)
            .unwrap()
            .compare(sequence),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        map_time(&clip, sequence, TimeSpace::ClipLocal)
            .unwrap()
            .compare(Time::milliseconds(1_100)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        map_time(&clip, sequence, TimeSpace::Source)
            .unwrap()
            .compare(Time::milliseconds(2_500)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(clip.rate.source_offset(2_000).unwrap(), 3_000);
}
