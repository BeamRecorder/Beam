#![allow(clippy::expect_used)]

use std::io::{BufReader, Cursor};

use capture::protocol::{RequestEnvelope, read_json_line, write_json_line};

#[test]
fn json_lines_roundtrip_and_eof() {
    let request: RequestEnvelope =
        serde_json::from_str(r#"{"id":"1","command":"status"}"#).expect("request");
    let mut output = Vec::new();
    write_json_line(&mut output, &request).expect("write");
    let mut reader = BufReader::new(Cursor::new(output));
    let decoded: RequestEnvelope = read_json_line(&mut reader).expect("read").expect("line");
    assert_eq!(decoded.id, "1");
    assert!(
        read_json_line::<RequestEnvelope>(&mut reader)
            .expect("eof")
            .is_none()
    );
}
