#![cfg(test)]

use super::{backend_error, dimension};

#[test]
fn mac_catalog_dimensions_remain_positive_and_bounded() {
    assert_eq!(dimension(-4.0), 1);
    assert_eq!(dimension(0.0), 1);
    assert_eq!(dimension(1280.9), 1280);
    assert_eq!(dimension(f64::MAX), u32::MAX);
    assert!(
        backend_error("catalog failed")
            .to_string()
            .contains("catalog failed")
    );
}
