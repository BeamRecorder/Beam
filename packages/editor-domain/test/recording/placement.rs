use beam_editor_domain::recording::{placement::fit, types::Interval};
#[test]
fn empty_short_and_fully_reserved_gaps_cannot_hold_a_zoom() {
    assert_eq!(fit(0, 1000, 0, &[]), None);
    assert_eq!(fit(50, 1000, 199, &[]), None);
    assert_eq!(
        fit(
            500,
            300,
            1000,
            &[Interval {
                start_ms: 0,
                end_ms: 1000
            }]
        ),
        None
    );
}
#[test]
fn boundary_anchors_and_minimum_duration_are_clamped() {
    assert_eq!(
        fit(0, 1, 1000, &[]),
        Some(Interval {
            start_ms: 0,
            end_ms: 200
        })
    );
    assert_eq!(
        fit(9999, 500, 1000, &[]),
        Some(Interval {
            start_ms: 500,
            end_ms: 1000
        })
    );
    assert_eq!(
        fit(500, 5000, 1000, &[]),
        Some(Interval {
            start_ms: 0,
            end_ms: 1000
        })
    );
}
#[test]
fn unordered_overlaps_and_invalid_ranges_are_merged_before_placement() {
    let ranges = [
        Interval {
            start_ms: 800,
            end_ms: 2000,
        },
        Interval {
            start_ms: 400,
            end_ms: 900,
        },
        Interval {
            start_ms: 50,
            end_ms: 40,
        },
    ];
    assert_eq!(
        fit(200, 500, 1000, &ranges),
        Some(Interval {
            start_ms: 0,
            end_ms: 400
        })
    );
    assert_eq!(fit(700, 200, 1000, &ranges), None);
}
