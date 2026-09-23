#![cfg(test)]

use super::*;

#[test]
fn recognizes_standard_handles() {
    assert_eq!(
        classify_handle(3, &[(3, CursorKind::Handpointing)]),
        CursorKind::Handpointing
    );
}

#[test]
fn keeps_unknown_handles_custom() {
    assert_eq!(
        classify_handle(9, &[(3, CursorKind::Handpointing)]),
        CursorKind::Custom
    );
}

#[test]
fn does_not_treat_a_zero_handle_as_default() {
    assert_eq!(classify_handle(0, &[]), CursorKind::Custom);
}

fn classify_handle(native_id: usize, cursors: &[(usize, CursorKind)]) -> CursorKind {
    cursors
        .iter()
        .find_map(|(handle, kind)| (*handle == native_id).then_some(*kind))
        .unwrap_or(CursorKind::Custom)
}
