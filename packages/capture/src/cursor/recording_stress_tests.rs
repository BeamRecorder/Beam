#![allow(clippy::expect_used)]
use super::finalize_session_cursor;
use crate::cursor::{CursorEvent, CursorEventWriter, MAX_CURSOR_TELEMETRY_SAMPLES};

#[test]
fn excessive_shape_metadata_fails_without_replacing_saved_history() {
    for (count, identity_bytes, reason) in [(4097, 8, "4096 identities"), (16, 600_000, "8 MiB")] {
        let temporary = tempfile::tempdir().expect("directory");
        let partial = temporary.path().join("cursor.partial.jsonl");
        let destination = temporary.path().join("cursor.json");
        std::fs::write(&destination, "[]").expect("existing history");
        let mut writer = CursorEventWriter::open(&partial).expect("journal");
        for index in 0..count {
            writer
                .push(CursorEvent::Shape {
                    session_ns: index as u64,
                    cursor_id: format!("shape-{index}"),
                    native_cursor_id: "x".repeat(identity_bytes),
                    cursor_kind: crate::cursor::CursorKind::Custom,
                    hotspot: crate::cursor::Hotspot { x: 0, y: 0 },
                })
                .expect("shape");
        }
        writer.flush().expect("flush");
        drop(writer);
        assert!(
            finalize_session_cursor(temporary.path())
                .expect_err("bounded metadata")
                .to_string()
                .contains(reason)
        );
        assert_eq!(
            std::fs::read_to_string(&destination).expect("history"),
            "[]"
        );
        assert!(partial.exists());
        assert!(temporary.path().read_dir().expect("entries").all(|entry| {
            !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")
        }));
    }
}

#[test]
fn a_thousand_pause_segments_keep_the_entire_cursor_and_input_history() {
    let temporary = tempfile::tempdir().expect("directory");
    let partial = temporary.path().join("cursor.partial.jsonl");
    let input_partial = temporary.path().join("input.partial.jsonl");
    for segment in 0..1000_u64 {
        let mut writer = CursorEventWriter::open(&partial).expect("resume journal");
        writer
            .push(CursorEvent::Visibility {
                session_ns: segment * 10_000_000_000,
                visible: true,
            })
            .expect("event");
        writer.flush().expect("pause flush");
        let mut input =
            crate::input::InputEventWriter::open(&input_partial).expect("input journal");
        input
            .push(&crate::input::InputEvent::MouseButton {
                session_ns: segment * 10_000_000_000,
                button: 1,
                pressed: true,
            })
            .expect("input");
        input.flush().expect("flush input");
    }
    finalize_session_cursor(temporary.path()).expect("finalize session");
    let events: Vec<CursorEvent> =
        crate::storage::read_json(&temporary.path().join("cursor.json")).expect("events");
    let input: crate::input::InputEventSidecar =
        crate::storage::read_json(&temporary.path().join("input.json")).expect("input");
    assert_eq!(events.len(), 1000);
    assert_eq!(input.events.len(), 1000);
    assert_eq!(input.events[999].session_ns(), 999 * 10_000_000_000);
    assert!(matches!(
        events[0],
        CursorEvent::Visibility { session_ns: 0, .. }
    ));
    let original = std::fs::read(temporary.path().join("cursor.json")).expect("bytes");
    finalize_session_cursor(temporary.path()).expect("retry is harmless");
    assert_eq!(
        std::fs::read(temporary.path().join("cursor.json")).expect("bytes"),
        original
    );
}

#[test]
fn multi_hour_cursor_journal_keeps_all_events_and_bounds_telemetry() {
    let temporary = tempfile::tempdir().expect("directory");
    let mut writer =
        CursorEventWriter::open(&temporary.path().join("cursor.partial.jsonl")).expect("journal");
    let count = MAX_CURSOR_TELEMETRY_SAMPLES * 3;
    for event in 0..count {
        writer
            .push(CursorEvent::Move {
                session_ns: event as u64 * 33_333_333,
                cursor_id: None,
                pixel_x: event as i32,
                pixel_y: 0,
                normalized_x: 0.5,
                normalized_y: 0.5,
                visible: true,
            })
            .expect("event");
    }
    writer.flush().expect("flush");
    drop(writer);
    std::fs::write(temporary.path().join("input.partial.jsonl"), "").expect("empty input");
    finalize_session_cursor(temporary.path()).expect("publish");
    let telemetry: crate::cursor::CursorTelemetrySidecar =
        crate::storage::read_json(&temporary.path().join("telemetry.json")).expect("telemetry");
    assert_eq!(telemetry.samples.len(), MAX_CURSOR_TELEMETRY_SAMPLES);
    assert_eq!(
        telemetry.samples[0].time_ms,
        ((count - MAX_CURSOR_TELEMETRY_SAMPLES) as u64 * 33_333_333) / 1_000_000
    );
    // Stream the array with a visitor instead of allocating a second full history.
    struct Count;
    impl<'de> serde::de::Visitor<'de> for Count {
        type Value = usize;
        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("cursor array")
        }
        fn visit_seq<A: serde::de::SeqAccess<'de>>(
            self,
            mut sequence: A,
        ) -> Result<usize, A::Error> {
            let mut count = 0;
            while sequence.next_element::<CursorEvent>()?.is_some() {
                count += 1;
            }
            Ok(count)
        }
    }
    use serde::de::Deserializer;
    let mut reader = serde_json::Deserializer::from_reader(std::io::BufReader::new(
        std::fs::File::open(temporary.path().join("cursor.json")).expect("cursor"),
    ));
    assert_eq!(
        (&mut reader).deserialize_seq(Count).expect("count events"),
        count
    );
}

#[test]
fn failed_publication_retains_journal_and_retry_does_not_duplicate_events() {
    let temporary = tempfile::tempdir().expect("directory");
    let partial = temporary.path().join("cursor.partial.jsonl");
    let mut writer = CursorEventWriter::open(&partial).expect("journal");
    writer
        .push(CursorEvent::Visibility {
            session_ns: 42,
            visible: true,
        })
        .expect("event");
    writer.flush().expect("flush");
    drop(writer);
    std::fs::create_dir(temporary.path().join("telemetry.json")).expect("block publication");
    assert!(finalize_session_cursor(temporary.path()).is_err());
    assert!(partial.exists());
    std::fs::remove_dir(temporary.path().join("telemetry.json")).expect("restore destination");
    finalize_session_cursor(temporary.path()).expect("retry");
    let events: Vec<CursorEvent> =
        crate::storage::read_json(&temporary.path().join("cursor.json")).expect("events");
    assert_eq!(events.len(), 1);
    assert!(!partial.exists());
    assert!(temporary.path().read_dir().expect("entries").all(|entry| {
        !entry
            .expect("entry")
            .path()
            .to_string_lossy()
            .ends_with(".tmp")
    }));
}
