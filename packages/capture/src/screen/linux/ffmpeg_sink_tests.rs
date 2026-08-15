#![allow(clippy::expect_used)]

use std::path::PathBuf;

use crate::{
    cursor::{CursorKind, Hotspot},
    screen::{CursorSampleState, PixelFormat, VideoFormat},
};

use super::{CursorOutput, encoded_video_format};
use crate::screen::linux::cursor_buttons::RecordedButton;
use crate::screen::linux::cursor_fusion::CursorInputEvent;

#[path = "ffmpeg_sink_tests/sink.rs"]
mod sink;

#[test]
fn encoded_format_pads_odd_dimensions_for_yuv420() {
    let actual = encoded_video_format(VideoFormat {
        width: 1919,
        height: 1079,
        stride: 7_676,
        pixel_format: PixelFormat::Bgra8,
    });
    assert_eq!(
        (actual.width, actual.height, actual.stride),
        (1920, 1080, 7680)
    );
}

#[test]
fn encoded_format_preserves_even_dimensions() {
    let actual = encoded_video_format(VideoFormat {
        width: 1280,
        height: 720,
        stride: 5_120,
        pixel_format: PixelFormat::Bgra8,
    });
    assert_eq!((actual.width, actual.height), (1280, 720));
}

#[test]
fn cursor_samples_keep_native_identity_visibility_and_hotspot() {
    let mut output = CursorOutput::new(PathBuf::from("unused"));
    let sample = CursorSampleState::Known {
        native_cursor_id: "pipewire:stream:7".into(),
        cursor_kind: CursorKind::Handpointing,
        pixel_x: -2,
        pixel_y: 9,
        normalized_x: -0.1,
        normalized_y: 0.5,
        visible: true,
        hotspot: Some(Hotspot { x: 2, y: 3 }),
    };
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    output.directory = temporary.path().into();
    output.push_sample(42, sample).expect("cursor sample");
    assert_eq!(output.events.len(), 3);
    assert_eq!(output.shapes.len(), 1);
    assert!(matches!(
        output.events.first(),
        Some(crate::cursor::CursorEvent::Shape {
            cursor_kind: CursorKind::Handpointing,
            ..
        })
    ));
    assert_eq!(
        output.shapes["pipewire:stream:7"].cursor_kind,
        CursorKind::Handpointing
    );
    assert_eq!(output.previous_visibility, Some(true));
}

#[test]
fn cursor_samples_emit_a_shape_sidecar_without_a_hotspot() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    output
        .push_sample(
            42,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:9".into(),
                cursor_kind: CursorKind::Textcursor,
                pixel_x: 10,
                pixel_y: 12,
                normalized_x: 0.25,
                normalized_y: 0.5,
                visible: true,
                hotspot: None,
            },
        )
        .expect("cursor sample");

    assert!(matches!(
        output.events.first(),
        Some(crate::cursor::CursorEvent::Shape {
            cursor_id,
            cursor_kind: CursorKind::Textcursor,
            native_cursor_id,
            hotspot,
            ..
        }) if cursor_id == "pipewire:stream:9"
            && native_cursor_id == "pipewire:stream:9"
            && hotspot == &Hotspot { x: 0, y: 0 }
    ));
    assert_eq!(output.shapes.len(), 1);
    assert_eq!(
        output.shapes["pipewire:stream:9"].hotspot,
        Hotspot { x: 0, y: 0 }
    );
    assert_eq!(
        output.shapes["pipewire:stream:9"].cursor_kind,
        CursorKind::Textcursor
    );
}

#[test]
fn cursor_output_records_a_textcursor_transition_without_a_video_sample() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    output
        .push_sample(
            10,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:default".into(),
                cursor_kind: CursorKind::Default,
                pixel_x: 10,
                pixel_y: 20,
                normalized_x: 0.1,
                normalized_y: 0.2,
                visible: true,
                hotspot: Some(Hotspot { x: 0, y: 0 }),
            },
        )
        .expect("default cursor sample");
    output
        .push_sample(
            20,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:text".into(),
                cursor_kind: CursorKind::Textcursor,
                pixel_x: 11,
                pixel_y: 20,
                normalized_x: 0.11,
                normalized_y: 0.2,
                visible: true,
                hotspot: Some(Hotspot { x: 8, y: 12 }),
            },
        )
        .expect("text cursor sample");

    let shapes: Vec<(u64, CursorKind)> = output
        .events
        .iter()
        .filter_map(|event| match event {
            crate::cursor::CursorEvent::Shape {
                session_ns,
                cursor_kind,
                ..
            } => Some((*session_ns, *cursor_kind)),
            _ => None,
        })
        .collect();
    assert_eq!(
        shapes,
        [(10, CursorKind::Default), (20, CursorKind::Textcursor),]
    );
    assert_eq!(output.shapes.len(), 2);
    assert_eq!(
        output.shapes["pipewire:stream:text"].cursor_kind,
        CursorKind::Textcursor
    );
    assert!(temporary.path().join("cursor.partial.jsonl").is_file());
    assert!(!temporary.path().join("segment-0001.mp4").exists());
}

#[test]
fn cursor_samples_emit_distinct_shapes_for_native_ids_without_bitmaps() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    for (session_ns, native_cursor_id) in [(10, "pipewire:stream:17"), (20, "pipewire:stream:23")] {
        output
            .push_sample(
                session_ns,
                CursorSampleState::Known {
                    native_cursor_id: native_cursor_id.into(),
                    cursor_kind: CursorKind::Custom,
                    pixel_x: 10,
                    pixel_y: 12,
                    normalized_x: 0.25,
                    normalized_y: 0.5,
                    visible: true,
                    // No bitmap-derived shape data is available; the raw SPA
                    // identity still needs to produce a distinct Shape event.
                    hotspot: None,
                },
            )
            .expect("cursor sample");
    }

    let shape_ids: Vec<&str> = output
        .events
        .iter()
        .filter_map(|event| match event {
            crate::cursor::CursorEvent::Shape { cursor_id, .. } => Some(cursor_id.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(shape_ids, ["pipewire:stream:17", "pipewire:stream:23"]);
    assert_eq!(output.shapes.len(), 2);
    assert!(output.shapes.contains_key("pipewire:stream:17"));
    assert!(output.shapes.contains_key("pipewire:stream:23"));
}

#[test]
fn unknown_cursor_sample_does_not_invent_events() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    output
        .push_sample(42, CursorSampleState::Unknown)
        .expect("unknown sample");
    assert!(output.events.is_empty());
    assert!(!temporary.path().join("cursor.partial.jsonl").exists());
}

#[test]
fn unknown_video_samples_do_not_discard_pending_buttons() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    output
        .push_sample(
            0,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:7".into(),
                cursor_kind: CursorKind::Default,
                pixel_x: 10,
                pixel_y: 10,
                normalized_x: 0.1,
                normalized_y: 0.1,
                visible: true,
                hotspot: None,
            },
        )
        .expect("initial cursor anchor");
    output.push_button(RecordedButton {
        session_ns: 10,
        button: 1,
        pressed: true,
    });
    output.push_button(RecordedButton {
        session_ns: 20,
        button: 1,
        pressed: false,
    });
    output
        .push_sample(25, CursorSampleState::Unknown)
        .expect("video frame without cursor metadata");
    output
        .push_sample(
            30,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:7".into(),
                cursor_kind: CursorKind::Default,
                pixel_x: 10,
                pixel_y: 10,
                normalized_x: 0.1,
                normalized_y: 0.1,
                visible: true,
                hotspot: None,
            },
        )
        .expect("next cursor anchor");
    output.materialize_buttons();

    let buttons = output
        .events
        .iter()
        .filter(|event| matches!(event, crate::cursor::CursorEvent::Button { .. }))
        .collect::<Vec<_>>();
    assert_eq!(buttons.len(), 2);
    assert!(matches!(
        buttons[0],
        crate::cursor::CursorEvent::Button {
            session_ns: 10,
            pressed: true,
            ..
        }
    ));
    assert!(matches!(
        buttons[1],
        crate::cursor::CursorEvent::Button {
            session_ns: 20,
            pressed: false,
            ..
        }
    ));
}

#[test]
fn cursor_output_places_drag_buttons_on_the_fused_evdev_path() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    output
        .push_sample(
            0,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:7".into(),
                cursor_kind: CursorKind::Default,
                pixel_x: 0,
                pixel_y: 0,
                normalized_x: 0.0,
                normalized_y: 0.0,
                visible: true,
                hotspot: None,
            },
        )
        .expect("initial cursor anchor");
    output.push_button(RecordedButton {
        session_ns: 5,
        button: 1,
        pressed: true,
    });
    output.push_input(CursorInputEvent {
        session_ns: 10,
        delta_x: 5,
        delta_y: 0,
    });
    output.push_button(RecordedButton {
        session_ns: 15,
        button: 1,
        pressed: false,
    });
    output.push_input(CursorInputEvent {
        session_ns: 20,
        delta_x: 5,
        delta_y: 0,
    });
    output
        .push_sample(
            30,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:7".into(),
                cursor_kind: CursorKind::Default,
                pixel_x: 100,
                pixel_y: 0,
                normalized_x: 1.0,
                normalized_y: 0.0,
                visible: true,
                hotspot: None,
            },
        )
        .expect("next cursor anchor");
    output.materialize_buttons();

    let drag_events = output
        .events
        .iter()
        .filter(|event| match event {
            crate::cursor::CursorEvent::Move { session_ns, .. }
            | crate::cursor::CursorEvent::Button { session_ns, .. } => *session_ns > 0,
            _ => false,
        })
        .collect::<Vec<_>>();
    assert_eq!(drag_events.len(), 5);
    assert!(matches!(
        drag_events[0],
        crate::cursor::CursorEvent::Button {
            session_ns: 5,
            normalized_x,
            pressed: true,
            ..
        } if *normalized_x == 0.0
    ));
    assert!(matches!(
        drag_events[2],
        crate::cursor::CursorEvent::Button {
            session_ns: 15,
            normalized_x,
            pressed: false,
            ..
        } if (*normalized_x - (1.0 / 3.0)).abs() < f64::EPSILON
    ));
    assert!(matches!(
        drag_events[4],
        crate::cursor::CursorEvent::Move {
            session_ns: 30,
            pixel_x: 100,
            ..
        }
    ));
}
