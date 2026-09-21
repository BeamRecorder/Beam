#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_media_core::LatestFrame;

#[test]
fn preview_starts_empty_and_keeps_newest_frame() {
    let preview = LatestFrame::new();
    assert_eq!(preview.take(), None);
    assert_eq!(preview.publish(1), None);
    assert_eq!(preview.publish(2), Some(1));
    assert_eq!(preview.take(), Some(2));
    assert_eq!(preview.take(), None);
}

#[test]
fn preview_transfers_frame_between_threads() {
    let preview = Arc::new(LatestFrame::new());
    let producer = preview.clone();
    let thread = std::thread::spawn(move || producer.publish(vec![1, 2, 3]));
    assert_eq!(thread.join().expect("thread completed"), None);
    assert_eq!(preview.take(), Some(vec![1, 2, 3]));
}
