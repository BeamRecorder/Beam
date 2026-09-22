#![cfg(test)]
#![allow(clippy::expect_used)]

use super::checked_packed_bgra_len;

#[test]
fn packed_bgra_copy_stays_within_the_native_buffer_and_queue_budget() {
    assert_eq!(
        checked_packed_bgra_len(640, 480, 2560, 1_228_800, 1_228_800).expect("size"),
        1_228_800
    );
    assert!(checked_packed_bgra_len(640, 480, 2559, usize::MAX, usize::MAX).is_err());
    assert!(checked_packed_bgra_len(640, 480, 2560, 1_228_799, usize::MAX).is_err());
    assert!(checked_packed_bgra_len(640, 480, 2560, usize::MAX, 1_228_799).is_err());
    assert!(checked_packed_bgra_len(usize::MAX, 1, usize::MAX, usize::MAX, usize::MAX).is_err());
    assert!(checked_packed_bgra_len(0, 480, 0, usize::MAX, usize::MAX).is_err());
    assert!(checked_packed_bgra_len(640, 0, 2560, usize::MAX, usize::MAX).is_err());
}

#[test]
fn packed_bgra_length_accounts_for_padded_rows() {
    assert_eq!(
        checked_packed_bgra_len(2, 3, 12, 36, 36).expect("padded frame"),
        36
    );
    assert!(checked_packed_bgra_len(2, 3, 12, 35, 36).is_err());
    assert!(checked_packed_bgra_len(2, 3, 12, 36, 35).is_err());
}

#[test]
fn packed_bgra_rejects_height_times_stride_overflow() {
    let error = checked_packed_bgra_len(1, usize::MAX, 4, usize::MAX, usize::MAX)
        .expect_err("height times stride overflows");
    assert!(error.to_string().contains("frame size overflow"));
}
