use crate::fixtures::{decision, decision_mut};
use beam_editor_domain::recording::{
    cursor, style_types::CursorStyle, types::CursorInteractionType,
};

fn points() -> Vec<beam_editor_domain::recording::types::CursorPoint> {
    vec![
        crate::fixtures::point(100, 0.2, 0.3, None),
        crate::fixtures::point(500, 0.8, 0.7, Some(CursorInteractionType::Click)),
        crate::fixtures::point(1000, 0.8, 0.7, None),
    ]
}
#[test]
fn cursor_requires_real_prior_data_and_handles_disabled_and_nonfinite_time() {
    let style = CursorStyle::default();
    assert!(cursor::source_at(&[], &style, 200.).is_none());
    assert!(cursor::source_at(&points(), &style, 99.).is_none());
    assert!(cursor::source_at(&points(), &style, f64::NAN).is_none());
    assert!(
        cursor::source_at(
            &points(),
            &CursorStyle {
                enabled: false,
                ..style
            },
            200.
        )
        .is_none()
    );
}
#[test]
fn seek_order_does_not_change_smoothed_position_click_pulse_or_auto_hide() {
    let style = CursorStyle {
        smoothing_ms: 100,
        hide_after_ms: 1000,
        ..Default::default()
    };
    let points = points();
    let first = cursor::source_at(&points, &style, 600.).unwrap();
    let hidden = cursor::source_at(&points, &style, 1800.).unwrap();
    let repeated = cursor::source_at(&points, &style, 600.).unwrap();
    assert_eq!(first, repeated);
    assert!(first.x > 0.5 && first.x < 0.8);
    assert_eq!(first.click, Some(100. / 350.));
    assert_eq!(hidden.opacity, 0.);
    assert_eq!(hidden.click, None);
}
#[test]
fn instantaneous_style_maps_clip_retime_through_the_shared_source_clock() {
    let mut project = crate::fixtures::project();
    project.assets[0].cursor = points().into();
    let mut clip = decision_mut(&mut project.clips, 0);
    clip.start_ms = 3000;
    clip.source_in_ms = 100;
    clip.rate.numerator = 2;
    let style = CursorStyle {
        smoothing_ms: 0,
        hide_after_ms: 0,
        clicks: false,
        ..Default::default()
    };
    let value = cursor::at(
        &project.assets[0],
        &clip,
        &style,
        beam_editor_domain::timing::Time::milliseconds(3200),
    )
    .unwrap()
    .unwrap();
    assert_eq!((value.x, value.y), (0.8, 0.7));
    assert_eq!(value.click, None);
    assert_eq!(value.opacity, 1.);
}

#[test]
fn prepared_cursor_index_bounds_idle_queries_without_replaying_telemetry() {
    let mut points = vec![
        crate::fixtures::point(0, 0.2, 0.3, None),
        crate::fixtures::point(100, 0.8, 0.7, Some(CursorInteractionType::Click)),
    ];
    points.extend((101..10_000).map(|time| crate::fixtures::point(time, 0.8, 0.7, None)));
    let index = cursor::prepare(&points);
    assert_eq!(index.activity, vec![0, 100]);
    assert_eq!(index.clicks, vec![100]);
    let style = CursorStyle {
        smoothing_ms: 0,
        hide_after_ms: 1000,
        ..Default::default()
    };
    assert_eq!(
        cursor::source_at_prepared(&points, &index, &style, 9999.)
            .unwrap()
            .opacity,
        0.
    );
    assert_eq!(
        cursor::source_at_prepared(&points, &index, &style, 150.),
        cursor::source_at(&points, &style, 150.)
    );
    assert!(cursor::prepare(&[]).activity.is_empty());
}

#[test]
fn cursor_mapping_errors_are_explicit_even_for_a_hidden_style() {
    let mut project = crate::fixtures::project();
    let style = CursorStyle {
        enabled: false,
        ..Default::default()
    };
    decision_mut(&mut project.clips, 0).rate.denominator = 0;
    assert!(
        cursor::at(
            &project.assets[0],
            &decision(&project.clips, 0),
            &style,
            beam_editor_domain::timing::Time::ZERO
        )
        .is_err()
    );
    assert!(
        cursor::at_prepared(
            &project.assets[0],
            &decision(&project.clips, 0),
            &Default::default(),
            &style,
            beam_editor_domain::timing::Time::ZERO
        )
        .is_err()
    );
}
