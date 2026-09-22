#![allow(clippy::expect_used)]

use std::io::Cursor;

use capture::protocol::{MAX_LINE_BYTES, read_json_line};

#[test]
fn oversized_jsonl_line_is_rejected_before_deserialization() {
    let oversized = vec![b'x'; MAX_LINE_BYTES + 2];
    let mut reader = Cursor::new(oversized);
    let error = read_json_line::<serde_json::Value>(&mut reader).expect_err("oversized line");
    assert!(error.to_string().contains("exceeds 1 MiB"));
}

#[test]
fn crlf_jsonl_line_is_read_without_a_spurious_second_value() {
    let mut reader = Cursor::new(b"{\"ok\":true}\r\n".as_slice());
    let value = read_json_line::<serde_json::Value>(&mut reader)
        .expect("line")
        .expect("value");
    assert_eq!(value["ok"], true);
    assert!(
        read_json_line::<serde_json::Value>(&mut reader)
            .expect("EOF")
            .is_none()
    );
}
