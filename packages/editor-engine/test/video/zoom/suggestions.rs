use crate::fixtures::point;
use beam_editor_engine::video::zoom::{
    suggestions::{generate, normalize},
    types::{CursorInteractionType as Click, Interval},
};
#[test]
fn movement_only_and_missing_telemetry_do_not_invent_zooms() {
    assert!(generate(&[], 10_000, &[]).is_empty());
    assert!(generate(&[point(1000, 0.8, 0.5, Some(Click::Move))], 10_000, &[]).is_empty());
}
#[test]
fn normalization_clamps_sorts_and_discards_nonfinite_positions() {
    let result = normalize(
        &[
            point(20_000, 2., -1., None),
            point(10, 0.5, 0.5, None),
            point(1, f64::NAN, 0., None),
        ],
        10_000,
    );
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].time_ms, 10);
    assert_eq!(
        (result[1].cx, result[1].cy, result[1].time_ms),
        (1., 0., 10_000)
    );
}
#[test]
fn cluster_uses_strongest_click_and_splits_after_two_and_a_half_seconds() {
    let samples = [
        point(1000, 0.2, 0.5, Some(Click::Click)),
        point(3500, 0.8, 0.5, Some(Click::DoubleClick)),
        point(6001, 0.4, 0.5, Some(Click::RightClick)),
    ];
    let result = generate(&samples, 10_000, &[]);
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].cx, 0.8);
    assert_eq!(result[0].scale, 1.5);
    assert_eq!(result[0].start_ms, 500);
    assert_eq!(result[0].end_ms, 4000);
}
#[test]
fn manual_reserved_intervals_and_tiny_sources_are_preserved() {
    let samples = [point(1000, 0.5, 0.5, Some(Click::MiddleClick))];
    assert!(
        generate(
            &samples,
            2000,
            &[Interval {
                start_ms: 0,
                end_ms: 2000
            }]
        )
        .is_empty()
    );
    assert!(generate(&samples, 199, &[]).is_empty());
}
