use beam_editor_mcp::io::*;
use std::io::Cursor;
#[test]
fn frame_reader_preserves_following_lines_and_bounds() {
    let mut input = Cursor::new(b"{}\n[]\n");
    assert_eq!(read_message(&mut input).unwrap().unwrap(), b"{}\n");
    assert_eq!(read_message(&mut input).unwrap().unwrap(), b"[]\n");
    assert!(read_message(&mut input).unwrap().is_none());
    assert!(read_message(&mut Cursor::new(b"{}")).is_err());
    assert!(
        read_message(&mut Cursor::new(vec![
            b'a';
            beam_editor_domain::protocol::MESSAGE_BUDGET
                + 1
        ]))
        .is_err()
    );
}
#[test]
fn frame_writer_emits_one_json_line_and_propagates_failures() {
    let mut output = Vec::new();
    write_message(&mut output, &serde_json::json!({"text":"line\nline"})).unwrap();
    assert_eq!(output.iter().filter(|byte| **byte == b'\n').count(), 1);
    struct Broken;
    impl std::io::Write for Broken {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("closed"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    assert!(write_message(&mut Broken, &serde_json::json!({})).is_err());
    assert!(
        write_message(
            &mut Vec::new(),
            &serde_json::json!("a".repeat(beam_editor_domain::protocol::MESSAGE_BUDGET))
        )
        .is_err()
    );
}
