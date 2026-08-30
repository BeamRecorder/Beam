#![allow(clippy::expect_used)]

use super::flip_bgra_rows;
use crate::model::ScreenRegion;
use crate::screen::normalize_crop;

#[test]
fn flips_bgra_rows_from_top_to_bottom() {
    let source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    assert_eq!(
        flip_bgra_rows(&source, 2, 2),
        [9, 10, 11, 12, 13, 14, 15, 16, 1, 2, 3, 4, 5, 6, 7, 8]
    );
}

#[test]
fn normalized_dimensions_are_the_row_dimensions_used_for_bgra_conversion() {
    let crop = normalize_crop(
        ScreenRegion {
            x: 0.1,
            y: 0.1,
            width: 0.3,
            height: 0.4,
        },
        10,
        10,
    )
    .expect("valid crop");
    let source = [
        1, 2, 3, 4, 5, 6, 7, 8, // row 0
        9, 10, 11, 12, 13, 14, 15, 16, // row 1
        17, 18, 19, 20, 21, 22, 23, 24, // row 2
        25, 26, 27, 28, 29, 30, 31, 32, // row 3
    ];
    assert_eq!(
        flip_bgra_rows(&source, crop.width(), crop.height()),
        [
            25, 26, 27, 28, 29, 30, 31, 32, // row 3
            17, 18, 19, 20, 21, 22, 23, 24, // row 2
            9, 10, 11, 12, 13, 14, 15, 16, // row 1
            1, 2, 3, 4, 5, 6, 7, 8, // row 0
        ]
    );
}
