#![cfg_attr(not(windows), allow(dead_code))]

use crate::{CaptureError, model::ScreenRegion};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PixelCrop {
    pub(crate) start_x: u32,
    pub(crate) start_y: u32,
    pub(crate) end_x: u32,
    pub(crate) end_y: u32,
}

impl PixelCrop {
    pub(crate) const fn width(self) -> u32 {
        self.end_x - self.start_x
    }

    pub(crate) const fn height(self) -> u32 {
        self.end_y - self.start_y
    }
}

pub(crate) fn normalize_crop(
    region: ScreenRegion,
    frame_width: u32,
    frame_height: u32,
) -> Result<PixelCrop, CaptureError> {
    if frame_width < 2 || frame_height < 2 {
        return Err(CaptureError::InvalidConfiguration(
            "captured frame is smaller than the minimum encodable dimensions".into(),
        ));
    }
    let (start_x, start_y, end_x, end_y) = region.pixel_rect(frame_width, frame_height)?;
    let width = normalized_crop_dimension(end_x - start_x, frame_width)?;
    let height = normalized_crop_dimension(end_y - start_y, frame_height)?;

    // A one-pixel selection cannot be made H.264-compatible by trimming. Keep
    // it valid by taking the smallest even crop and move it inward at an edge.
    let start_x = start_x.min(frame_width - width);
    let start_y = start_y.min(frame_height - height);
    Ok(PixelCrop {
        start_x,
        start_y,
        end_x: start_x + width,
        end_y: start_y + height,
    })
}

pub(crate) fn even_dimension(val: u32) -> u32 {
    (val & !1).max(2)
}

fn normalized_crop_dimension(value: u32, frame_dimension: u32) -> Result<u32, CaptureError> {
    let dimension = even_dimension(value);
    if dimension > frame_dimension {
        return Err(CaptureError::InvalidConfiguration(
            "screen crop is smaller than the minimum encodable dimensions".into(),
        ));
    }
    Ok(dimension)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]

    use super::{PixelCrop, even_dimension, normalize_crop};
    use crate::model::ScreenRegion;

    fn region(x: f64, y: f64, width: f64, height: f64) -> ScreenRegion {
        ScreenRegion {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn rounds_odd_dimensions_to_even() {
        assert_eq!(even_dimension(1237), 1236);
        assert_eq!(even_dimension(851), 850);
        assert_eq!(even_dimension(1), 2);
        assert_eq!(even_dimension(1920), 1920);
    }

    #[test]
    fn normalizes_odd_crop_width_by_trimming_the_right_edge() {
        assert_eq!(
            normalize_crop(region(0.1, 0.1, 0.3, 0.4), 10, 10).expect("valid crop"),
            PixelCrop {
                start_x: 1,
                start_y: 1,
                end_x: 3,
                end_y: 5,
            }
        );
    }

    #[test]
    fn normalizes_odd_crop_height_by_trimming_the_bottom_edge() {
        assert_eq!(
            normalize_crop(region(0.1, 0.1, 0.4, 0.3), 10, 10).expect("valid crop"),
            PixelCrop {
                start_x: 1,
                start_y: 1,
                end_x: 5,
                end_y: 3,
            }
        );
    }

    #[test]
    fn normalizes_odd_width_and_height_together() {
        let crop = normalize_crop(region(0.1, 0.1, 0.3, 0.3), 10, 10).expect("valid crop");
        assert_eq!(crop.width(), 2);
        assert_eq!(crop.height(), 2);
        assert_eq!(crop.end_x - crop.start_x, crop.width());
        assert_eq!(crop.end_y - crop.start_y, crop.height());
    }

    #[test]
    fn moves_a_one_pixel_edge_selection_inward_to_keep_it_inside_the_frame() {
        assert_eq!(
            normalize_crop(region(0.9, 0.9, 0.1, 0.1), 10, 10).expect("valid crop"),
            PixelCrop {
                start_x: 8,
                start_y: 8,
                end_x: 10,
                end_y: 10,
            }
        );
    }

    #[test]
    fn accepts_the_smallest_even_crop() {
        let crop = normalize_crop(region(0.0, 0.0, 0.5, 0.5), 4, 4).expect("valid crop");
        assert_eq!(
            crop,
            PixelCrop {
                start_x: 0,
                start_y: 0,
                end_x: 2,
                end_y: 2
            }
        );
    }

    #[test]
    fn full_screen_crop_is_trimmed_only_when_the_frame_is_odd() {
        assert_eq!(
            normalize_crop(region(0.0, 0.0, 1.0, 1.0), 1921, 1081).expect("valid crop"),
            PixelCrop {
                start_x: 0,
                start_y: 0,
                end_x: 1920,
                end_y: 1080,
            }
        );
    }

    #[test]
    fn derives_region_pixels_from_the_actual_scaled_frame_dimensions() {
        // Windows Graphics Capture can deliver a frame whose pixel size is
        // different from the logical monitor size reported to the UI (for
        // example with display scaling enabled). The normalized region must
        // be resolved against the frame that will actually be cropped.
        let crop = normalize_crop(region(0.25, 0.125, 0.5, 0.5), 1536, 864).expect("valid crop");

        assert_eq!(
            crop,
            PixelCrop {
                start_x: 384,
                start_y: 108,
                end_x: 1152,
                end_y: 540,
            }
        );
    }

    #[test]
    fn scaled_frame_crop_stays_inside_the_frame_and_matches_encoder_dimensions() {
        let frame_width = 1536;
        let frame_height = 864;
        let crop = normalize_crop(region(0.75, 0.75, 0.25, 0.25), frame_width, frame_height)
            .expect("valid crop");

        assert_eq!((crop.width(), crop.height()), (384, 216));
        assert_eq!((crop.width() % 2, crop.height() % 2), (0, 0));
        assert!(crop.end_x <= frame_width);
        assert!(crop.end_y <= frame_height);
    }

    #[test]
    fn frame_dimension_mismatch_changes_crop_dimensions_instead_of_using_display_size() {
        let region = region(0.0, 0.0, 0.5, 0.5);
        let logical_display_crop = normalize_crop(region, 1920, 1080).expect("valid crop");
        let actual_frame_crop = normalize_crop(region, 1536, 864).expect("valid crop");

        assert_eq!(
            (logical_display_crop.width(), logical_display_crop.height()),
            (960, 540)
        );
        assert_eq!(
            (actual_frame_crop.width(), actual_frame_crop.height()),
            (768, 432)
        );
        assert_ne!(logical_display_crop, actual_frame_crop);
    }
}
