#![cfg(test)]

use super::{coordinate, dimension};

#[test]
fn mac_cursor_geometry_saturates_out_of_range_coordinates() {
    assert_eq!(coordinate(f64::from(i32::MIN) - 100.0), i32::MIN);
    assert_eq!(coordinate(f64::from(i32::MAX) + 100.0), i32::MAX);
    assert_eq!(coordinate(12.9), 12);
    assert_eq!(dimension(-1.0), 1);
    assert_eq!(dimension(f64::MAX), u32::MAX);
}
