#![allow(clippy::expect_used)]
use super::repair_invalid_trailing_lines;

#[test]
fn torn_utf8_and_json_tail_preserve_the_exact_valid_prefix() {
    for tail in [
        &b"{\"event\":"[..],
        &b"\xf0\x9f"[..],
        &b"invalid\ninvalid\n"[..],
    ] {
        let temporary = tempfile::tempdir().expect("directory");
        let path = temporary.path().join("journal.jsonl");
        let prefix = b"{\"sessionNs\":1}\r\n\n{\"sessionNs\":2}\n";
        std::fs::write(&path, [prefix.as_slice(), tail].concat()).expect("journal");
        assert!(repair_invalid_trailing_lines(&path).expect("repair") > 0);
        assert_eq!(std::fs::read(&path).expect("read"), prefix);
        assert_eq!(repair_invalid_trailing_lines(&path).expect("idempotent"), 0);
    }
}

#[test]
fn interior_corruption_never_discards_later_valid_records() {
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("journal.jsonl");
    let original = b"{\"sessionNs\":1}\n{broken\n{\"sessionNs\":3}\n";
    std::fs::write(&path, original).expect("journal");
    assert!(repair_invalid_trailing_lines(&path).is_err());
    assert_eq!(std::fs::read(path).expect("original"), original);
}

#[test]
fn oversized_records_fail_without_mutating_the_journal() {
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("journal.jsonl");
    let bytes = vec![b'x'; 2 * 1024 * 1024];
    std::fs::write(&path, &bytes).expect("journal");
    assert!(repair_invalid_trailing_lines(&path).is_err());
    assert_eq!(std::fs::read(path).expect("original"), bytes);
}

#[test]
fn repair_streams_a_long_journal_without_rewriting_valid_bytes() {
    use std::io::Write;
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("journal.jsonl");
    let mut writer = std::io::BufWriter::new(std::fs::File::create(&path).expect("file"));
    for event in 0..250_000 {
        writeln!(writer, "{{\"sessionNs\":{event}}}").expect("write");
    }
    writer.flush().expect("flush");
    let valid_size = std::fs::metadata(&path).expect("size").len();
    writer.write_all(b"{torn").expect("tail");
    drop(writer);
    assert_eq!(repair_invalid_trailing_lines(&path).expect("repair"), 1);
    assert_eq!(std::fs::metadata(path).expect("size").len(), valid_size);
}
