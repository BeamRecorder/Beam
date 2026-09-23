#![cfg(test)]
use super::*;
#[test]
fn dimensions_are_bounded_even_pixels() {
    assert_eq!(dimension(0.0), 2);
    assert_eq!(dimension(121.0), 120);
    assert_eq!(dimension(f64::INFINITY), u32::MAX - 1);
}
