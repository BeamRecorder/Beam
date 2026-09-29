//! Native nearest-neighbor precision samples without screen reads during a drag.

use super::types::{Magnifier, RegionState, ScreenPixels};
use argui_core::Point;
use argui_paint::{ImageAsset, ImageId};

pub(super) const SAMPLE_SIZE: u32 = 24;
pub(super) const ZOOM: f32 = 6.0;
const IMAGE_ID: ImageId = ImageId(1_u64 << 42);

impl RegionState {
    /// Samples the actual capture boundary, rather than the handle's grip offset.
    pub(super) fn magnify(&mut self, at: Point) {
        let Some(pixels) = &self.pixels else {
            self.magnifier = None;
            return;
        };
        let scale = self.capture_scale();
        let x = (f64::from(at.x) * scale.x).round() as i32;
        let y = (f64::from(at.y) * scale.y).round() as i32;
        match sample(pixels, x, y) {
            Ok(image) => self.magnifier = Some(Magnifier { at, image }),
            Err(error) => {
                eprintln!("Beam region magnifier: {error}");
                self.magnifier = None;
            }
        }
    }

    /// Exposes only the tiny active raster to ARGUI's native image registry.
    pub(crate) fn images(&self) -> Vec<ImageAsset> {
        self.magnifier
            .as_ref()
            .map(|value| value.image.clone())
            .into_iter()
            .collect()
    }
}

/// Extracts a pixel-exact sample; pixels outside the monitor remain transparent.
pub(super) fn sample(pixels: &ScreenPixels, x: i32, y: i32) -> Result<ImageAsset, String> {
    if pixels.width == 0
        || pixels.height == 0
        || pixels.width > 16384
        || pixels.height > 16384
        || pixels.rgba.len() as u64 != u64::from(pixels.width) * u64::from(pixels.height) * 4
    {
        return Err("invalid screen pixels for region precision".into());
    }
    let mut rgba = vec![0; (SAMPLE_SIZE * SAMPLE_SIZE * 4) as usize];
    for row in 0..SAMPLE_SIZE as i32 {
        for column in 0..SAMPLE_SIZE as i32 {
            let sx = i64::from(x) + i64::from(column) - i64::from(SAMPLE_SIZE / 2);
            let sy = i64::from(y) + i64::from(row) - i64::from(SAMPLE_SIZE / 2);
            if sx < 0 || sy < 0 || sx >= i64::from(pixels.width) || sy >= i64::from(pixels.height) {
                continue;
            }
            let from = (sy as usize * pixels.width as usize + sx as usize) * 4;
            let to = (row as usize * SAMPLE_SIZE as usize + column as usize) * 4;
            rgba[to..to + 4].copy_from_slice(&pixels.rgba[from..from + 4]);
        }
    }
    ImageAsset::rgba8(IMAGE_ID, SAMPLE_SIZE, SAMPLE_SIZE, rgba).map_err(|error| error.to_string())
}
