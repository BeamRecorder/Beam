use capture::storage::{finish_segment, segment};

#[test]
fn failed_segment_end_does_not_mark_an_incomplete_file_complete() {
    let mut value = segment("screen/segment.webm".into(), 10);
    assert!(finish_segment(&mut value, 9).is_err());
    assert_eq!(value.end_ns, None);
    assert!(!value.complete);
}
