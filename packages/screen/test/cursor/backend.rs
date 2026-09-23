use beam_screen::cursor::{CURSOR_SAMPLE_INTERVAL_NS, move_sample_due};

#[test]
fn cursor_sampling_skips_missed_intervals_without_drifting() {
    let mut next = 0;
    assert!(move_sample_due(&mut next, 0));
    assert_eq!(next, CURSOR_SAMPLE_INTERVAL_NS);
    assert!(!move_sample_due(&mut next, CURSOR_SAMPLE_INTERVAL_NS - 1));
    assert!(move_sample_due(&mut next, CURSOR_SAMPLE_INTERVAL_NS * 10));
    assert_eq!(next, CURSOR_SAMPLE_INTERVAL_NS * 11);
}
