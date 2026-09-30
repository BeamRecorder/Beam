use beam_editor_domain::recording::{
    cursor_motion::{self, at, prepare, step},
    cursor_motion_types::MotionKey,
    cursor_style_types::CursorMotion,
    types::CursorInteractionType,
};
#[test]
fn motion_is_seek_independent_and_click_anchors_are_exact() {
    let points = vec![
        crate::fixtures::point(0, 0.1, 0.2, None),
        crate::fixtures::point(500, 0.8, 0.7, Some(CursorInteractionType::Click)),
        crate::fixtures::point(1000, 0.9, 0.9, None),
    ];
    let settings = CursorMotion::default();
    let keys = prepare(&points, &settings);
    let first = at(&points, &keys, &settings, 300.).unwrap();
    assert!(first.0 > 0.1 && first.0 < 0.52);
    assert_eq!(at(&points, &keys, &settings, 500.).unwrap(), (0.8, 0.7));
    at(&points, &keys, &settings, 2000.);
    assert_eq!(at(&points, &keys, &settings, 300.).unwrap(), first);
    assert!(at(&points, &keys, &settings, -1.).is_none());
}
#[test]
fn zero_smoothing_matches_capture_and_empty_or_missing_keys_have_no_position() {
    let points = vec![
        crate::fixtures::point(0, 0.2, 0.3, None),
        crate::fixtures::point(1000, 0.8, 0.7, None),
    ];
    let settings = CursorMotion {
        smoothing: 0.,
        ..Default::default()
    };
    let keys = prepare(&points, &settings);
    let value = at(&points, &keys, &settings, 500.).unwrap();
    assert!((value.0 - 0.5).abs() < 1e-12);
    assert!((value.1 - 0.5).abs() < 1e-12);
    assert!(prepare(&[], &settings).is_empty());
    assert!(at(&[], &[], &settings, 100.).is_none());
    assert!(at(&points, &[], &settings, 100.).is_none());
}
#[test]
fn all_damping_regimes_stay_finite_and_invalid_time_keeps_the_checkpoint() {
    let state = MotionKey {
        x: 0.2,
        y: 0.3,
        vx: 0.,
        vy: 0.,
    };
    for smoothing in [0., 0.1, (1. - 0.82) / 0.42, 0.67, 1.] {
        let settings = CursorMotion {
            smoothing,
            ..Default::default()
        };
        let moved = step(state, [0.2, 0.3], [0.8, 0.7], 0.5, &settings);
        assert!(moved.x.is_finite() && moved.y.is_finite());
        if smoothing > 0. {
            for seconds in [0., -1., f64::NAN, f64::INFINITY] {
                let same = step(state, [0.2, 0.3], [0.8, 0.7], seconds, &settings);
                assert_eq!(same.x, state.x);
            }
        }
    }
    let duplicate = vec![
        crate::fixtures::point(0, 0.2, 0.3, None),
        crate::fixtures::point(0, 0.8, 0.7, None),
    ];
    assert_eq!(
        cursor_motion::prepare(&duplicate, &CursorMotion::default())[1].x,
        0.8
    );
}
