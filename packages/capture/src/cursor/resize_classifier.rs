use std::f64::consts::FRAC_PI_4;

use crate::cursor::{CursorKind, Hotspot};

const BINS: usize = 16;
pub(super) const MAX_SIDE: u32 = 256;

/// Recognize a straight, double-headed resize arrow independently of the desktop
/// theme. Browser design tools rasterize their own cursors with transparent
/// padding, arbitrary angles and device scaling, so a theme bitmap is not enough.
pub(crate) fn resize_cursor_kind(
    pixels: &[u8],
    width: u32,
    height: u32,
    hotspot: Hotspot,
) -> Option<CursorKind> {
    if width == 0
        || height == 0
        || width > MAX_SIDE
        || height > MAX_SIDE
        || pixels.len() != width as usize * height as usize * 4
        || hotspot.x >= width
        || hotspot.y >= height
    {
        return None;
    }
    // Ignore low-alpha shadows and RGB values: the opaque silhouette carries
    // the arrow's meaning in both light and dark cursor artwork.
    let points: Vec<(f64, f64)> = pixels
        .as_chunks::<4>()
        .0
        .iter()
        .enumerate()
        .filter(|(_, pixel)| pixel[3] >= 128)
        .map(|(index, _)| {
            (
                (index % width as usize) as f64 + 0.5,
                (index / width as usize) as f64 + 0.5,
            )
        })
        .collect();
    if points.len() < 12 {
        return None;
    }
    let count = points.len() as f64;
    let cx = points.iter().map(|point| point.0).sum::<f64>() / count;
    let cy = points.iter().map(|point| point.1).sum::<f64>() / count;
    let (mut xx, mut yy, mut xy) = (0.0, 0.0, 0.0);
    for &(x, y) in &points {
        xx += (x - cx).powi(2);
        yy += (y - cy).powi(2);
        xy += (x - cx) * (y - cy);
    }
    let angle = 0.5 * (2.0 * xy).atan2(xx - yy);
    let (sine, cosine) = angle.sin_cos();
    let projected: Vec<(f64, f64)> = points
        .iter()
        .map(|&(x, y)| {
            (
                (x - cx) * cosine + (y - cy) * sine,
                -(x - cx) * sine + (y - cy) * cosine,
            )
        })
        .collect();
    let along = projected.iter().map(|point| point.0.powi(2)).sum::<f64>();
    let across = projected.iter().map(|point| point.1.powi(2)).sum::<f64>();
    if along < across * 2.25 {
        return None;
    }
    let start = projected
        .iter()
        .map(|point| point.0)
        .fold(f64::INFINITY, f64::min);
    let end = projected
        .iter()
        .map(|point| point.0)
        .fold(f64::NEG_INFINITY, f64::max);
    let length = end - start;
    if length < 10.0 {
        return None;
    }
    let hotspot_x = f64::from(hotspot.x) - cx;
    let hotspot_y = f64::from(hotspot.y) - cy;
    if (hotspot_x * cosine + hotspot_y * sine).abs() > length * 0.2
        || (-hotspot_x * sine + hotspot_y * cosine).abs() > length * 0.15
    {
        return None;
    }
    let mut minimum = [f64::INFINITY; BINS];
    let mut maximum = [f64::NEG_INFINITY; BINS];
    for (along, across) in projected {
        let bin = (((along - start) / length * BINS as f64) as usize).min(BINS - 1);
        minimum[bin] = minimum[bin].min(across);
        maximum[bin] = maximum[bin].max(across);
    }
    if !double_arrow_profile(&minimum, &maximum, length) {
        return None;
    }
    // Opposite directions share one resize role; a rotated object still gets
    // the closest of the four portable axes supported by every cursor pack.
    Some(match (angle / FRAC_PI_4).round() as i32 % 4 {
        0 => CursorKind::Resizewesteast,
        1 | -3 => CursorKind::Resizenorthwestsoutheast,
        2 | -2 => CursorKind::Resizenorthsouth,
        _ => CursorKind::Resizenortheastsouthwest,
    })
}

fn double_arrow_profile(minimum: &[f64; BINS], maximum: &[f64; BINS], length: f64) -> bool {
    if minimum
        .iter()
        .chain(maximum)
        .any(|value| !value.is_finite())
    {
        return false;
    }
    let widths: [f64; BINS] = std::array::from_fn(|index| maximum[index] - minimum[index] + 1.0);
    let left_head = widths[2..6].iter().copied().fold(0.0, f64::max);
    let right_head = widths[10..14].iter().copied().fold(0.0, f64::max);
    let head = left_head.min(right_head);
    let shaft = widths[6..10].iter().copied().fold(0.0, f64::max);
    // Two tapered tips, equally sized arrowheads and a narrow straight shaft
    // reject pointers, text beams, bars, crosses and single rotation arrows.
    if head < length * 0.12
        || head > length * 0.85
        || left_head.max(right_head) > head * 1.4
        || widths[0] > left_head * 0.7
        || widths[BINS - 1] > right_head * 0.7
        || shaft > head * 0.65
    {
        return false;
    }
    let symmetry_error = (0..BINS / 2)
        .map(|index| (widths[index] - widths[BINS - 1 - index]).abs())
        .sum::<f64>()
        / (BINS / 2) as f64;
    let shaft_center = (minimum[7] + maximum[7] + minimum[8] + maximum[8]) / 4.0;
    symmetry_error <= head * 0.25
        && (0..BINS).all(|index| {
            ((minimum[index] + maximum[index]) / 2.0 - shaft_center).abs() <= length * 0.1
        })
}

#[cfg(test)]
#[path = "resize_classifier_tests.rs"]
pub(crate) mod tests;
