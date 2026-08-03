#![allow(clippy::expect_used)]

use capture::cursor::*;

#[test]
fn coordinates_support_negative_origins_and_crop() {
    let point = map_coordinates(
        -50,
        25,
        CaptureRegion {
            x: -100,
            y: 0,
            width: 200,
            height: 100,
        },
    )
    .expect("coordinates");
    assert_eq!((point.pixel_x, point.pixel_y), (50, 25));
    assert_eq!((point.normalized_x, point.normalized_y), (0.25, 0.25));
    assert!(point.inside);
}

#[test]
fn semantic_shape_serializes_without_bitmap_fields() {
    let event = CursorEvent::Shape {
        session_ns: 42,
        cursor_id: "win:123".into(),
        cursor_kind: CursorKind::Custom,
        native_cursor_id: "win:123".into(),
        hotspot: Hotspot { x: 0, y: 0 },
    };
    let value = serde_json::to_value(event).expect("shape json");
    assert_eq!(value["cursorId"], "win:123");
    assert_eq!(value["cursorKind"], "custom");
    assert!(value.get("shapeId").is_none());
    assert!(value.get("png").is_none());
}

#[test]
fn telemetry_marks_two_near_left_clicks_as_double_click() {
    let events = vec![
        CursorEvent::Move {
            session_ns: 0,
            pixel_x: 0,
            pixel_y: 0,
            normalized_x: 0.4,
            normalized_y: 0.5,
            visible: true,
        },
        CursorEvent::Button {
            session_ns: 100_000_000,
            button: 1,
            pressed: true,
            normalized_x: 0.4,
            normalized_y: 0.5,
        },
        CursorEvent::Button {
            session_ns: 300_000_000,
            button: 1,
            pressed: true,
            normalized_x: 0.4,
            normalized_y: 0.5,
        },
    ];
    let telemetry = telemetry_from_events(&events);
    assert_eq!(telemetry.version, CURSOR_TELEMETRY_VERSION);
    assert_eq!(
        telemetry.samples[2].interaction_type,
        Some(CursorInteractionType::DoubleClick)
    );
}

#[test]
fn telemetry_distinguishes_a_right_click() {
    let events = vec![
        CursorEvent::Move {
            session_ns: 0,
            pixel_x: 0,
            pixel_y: 0,
            normalized_x: 0.4,
            normalized_y: 0.5,
            visible: true,
        },
        CursorEvent::Button {
            session_ns: 100_000_000,
            button: 2,
            pressed: true,
            normalized_x: 0.4,
            normalized_y: 0.5,
        },
    ];
    let telemetry = telemetry_from_events(&events);
    assert_eq!(
        telemetry.samples[1].interaction_type,
        Some(CursorInteractionType::RightClick)
    );
}

#[test]
fn telemetry_keeps_the_latest_hour_of_samples() {
    let events = (0..=MAX_CURSOR_TELEMETRY_SAMPLES)
        .map(|index| CursorEvent::Move {
            session_ns: u64::try_from(index).expect("sample index fits u64")
                * CURSOR_SAMPLE_INTERVAL_NS,
            pixel_x: 0,
            pixel_y: 0,
            normalized_x: 0.5,
            normalized_y: 0.5,
            visible: true,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        telemetry_from_events(&events).samples.len(),
        MAX_CURSOR_TELEMETRY_SAMPLES
    );
}

#[test]
fn movement_sampling_is_capped_at_sixty_hz_without_drift() {
    let mut next = 0;
    assert!(move_sample_due(&mut next, 0));
    assert_eq!(next, CURSOR_SAMPLE_INTERVAL_NS);
    assert!(!move_sample_due(&mut next, CURSOR_SAMPLE_INTERVAL_NS - 1));
    assert!(move_sample_due(&mut next, CURSOR_SAMPLE_INTERVAL_NS));
    assert_eq!(next, CURSOR_SAMPLE_INTERVAL_NS * 2);
    assert!(move_sample_due(
        &mut next,
        CURSOR_SAMPLE_INTERVAL_NS * 4 + 1
    ));
    assert_eq!(next, CURSOR_SAMPLE_INTERVAL_NS * 5);
}
