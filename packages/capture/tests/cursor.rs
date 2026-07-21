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
fn shapes_are_deduplicated_with_hotspot_in_hash() {
    let temp = tempfile::tempdir().expect("tempdir");
    let mut store = ShapeStore::new(temp.path()).expect("store");
    let rgba = [255_u8, 0, 0, 255];
    let first = store
        .store(CursorBitmap {
            width: 1,
            height: 1,
            rgba: &rgba,
            hotspot: Hotspot { x: 0, y: 0 },
        })
        .expect("shape");
    let second = store
        .store(CursorBitmap {
            width: 1,
            height: 1,
            rgba: &rgba,
            hotspot: Hotspot { x: 0, y: 0 },
        })
        .expect("shape");
    assert_eq!(first, second);
    assert_eq!(store.len(), 1);
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
        },
        CursorEvent::Button {
            session_ns: 300_000_000,
            button: 1,
            pressed: true,
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
fn telemetry_keeps_the_latest_hour_of_samples() {
    let events = (0..=MAX_CURSOR_TELEMETRY_SAMPLES)
        .map(|index| CursorEvent::Move {
            session_ns: u64::try_from(index).unwrap() * CURSOR_SAMPLE_INTERVAL_NS,
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
