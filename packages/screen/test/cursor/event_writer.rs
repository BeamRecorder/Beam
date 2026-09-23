#![allow(clippy::expect_used)]

use beam_screen::cursor::{CursorEvent, CursorEventWriter};

#[test]
fn cursor_event_writer_appends_complete_json_lines_after_reopen() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let path = temporary.path().join("cursor.partial.jsonl");
    for session_ns in [1, 2] {
        let mut writer = CursorEventWriter::open(&path).expect("open");
        writer
            .push(CursorEvent::Visibility {
                session_ns,
                visible: true,
            })
            .expect("event");
        writer.flush().expect("flush");
    }
    let lines = std::fs::read_to_string(path).expect("events");
    let parsed = lines
        .lines()
        .map(serde_json::from_str::<CursorEvent>)
        .collect::<Result<Vec<_>, _>>()
        .expect("JSONL");
    assert_eq!(parsed.len(), 2);
    assert!(matches!(
        parsed[0],
        CursorEvent::Visibility { session_ns: 1, .. }
    ));
}
