use std::ptr::{self, NonNull};

use objc2::AnyThread;
use objc2_app_kit::{NSBitmapFormat, NSBitmapImageRep, NSCursor};

use crate::cursor::{CursorKind, bitmap::pixel_hotspot, resize_classifier::resize_cursor_kind};

/// Called inside the sampler's main-thread autorelease pool. AppKit converts
/// the cursor image without writing artwork or changing the recording schema.
pub(super) fn resize_kind(cursor: &NSCursor) -> Option<CursorKind> {
    let image = cursor.image();
    let size = image.size();
    let point = cursor.hotSpot();
    // SAFETY: a null proposed rectangle and absent context/hints are supported.
    let cg_image =
        unsafe { image.CGImageForProposedRect_context_hints(ptr::null_mut(), None, None) }?;
    let bitmap = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg_image);
    let width = u32::try_from(bitmap.pixelsWide()).ok()?;
    let height = u32::try_from(bitmap.pixelsHigh()).ok()?;
    let hotspot = pixel_hotspot(
        (point.x, point.y),
        (size.width, size.height),
        (width, height),
    )?;
    let samples = usize::try_from(bitmap.samplesPerPixel()).ok()?;
    let bits = bitmap.bitsPerSample();
    let format = bitmap.bitmapFormat();
    if !bitmap.hasAlpha()
        || !(1..=5).contains(&samples)
        || !matches!(bits, 8 | 16)
        || format.contains(NSBitmapFormat::FloatingPointSamples)
    {
        return None;
    }
    let alpha_index = if format.contains(NSBitmapFormat::AlphaFirst) {
        0
    } else {
        samples - 1
    };
    let max_alpha = (1_usize << bits) - 1;
    let mut pixels = vec![0; (width * height * 4) as usize];
    for y in 0..height {
        for x in 0..width {
            let mut components = [0_usize; 5];
            // SAFETY: coordinates are within the representation, and storage
            // fits all samples. getPixel normalizes planar and byte ordering;
            // its origin and the cursor hotspot both use the top-left corner.
            unsafe {
                bitmap.getPixel_atX_y(NonNull::from(&mut components[0]), x as isize, y as isize);
            }
            let alpha = components[alpha_index].min(max_alpha) * 255 / max_alpha;
            pixels[((y * width + x) * 4 + 3) as usize] = alpha as u8;
        }
    }
    resize_cursor_kind(&pixels, width, height, hotspot)
}
