use super::{
    connection::{Connection, connect, error},
    desktop::{self, Target},
    pixels::{self, Layout},
};
use crate::{
    CaptureError,
    cursor::Hotspot,
    model::{ScreenRegion, SourceId},
    screen::{CursorSampleState, OwnedVideoFrame, PixelFormat, VideoFormat},
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use x11rb::{
    connection::Connection as _,
    protocol::{
        Event,
        composite::{ConnectionExt as _, Redirect},
        xfixes::ConnectionExt as _,
        xproto::{
            ChangeWindowAttributesAux, ConnectionExt as _, EventMask, ImageFormat, ImageOrder,
        },
    },
};

pub(crate) struct Reader {
    connection: Connection,
    screen: usize,
    target: Target,
    pixmap: Option<u32>,
    region: Option<ScreenRegion>,
    width: u32,
    height: u32,
    cursor: super::super::pipewire::CursorClassifier,
    last_monitor_check: Instant,
}
impl Reader {
    pub(crate) fn open(
        source: &SourceId,
        region: Option<ScreenRegion>,
        encode: bool,
    ) -> Result<Self, CaptureError> {
        if !super::session_supported() {
            return Err(error("Direct capture requires a local X11 session"));
        }
        let (connection, screen) = connect()?;
        connection
            .xfixes_query_version(5, 0)
            .map_err(error)?
            .reply()
            .map_err(error)?;
        let target = desktop::resolve(&connection, screen, source)?;
        if target.window.is_some() && region.is_some() {
            return Err(error("Regions require a monitor source"));
        }
        let (width, height) = match region {
            Some(region) => {
                let crop = crate::screen::normalize_crop(
                    region,
                    target.bounds.width,
                    target.bounds.height,
                )?;
                (crop.width(), crop.height())
            }
            None => (target.bounds.width, target.bounds.height),
        };
        let (width, height) = if encode {
            (width & !1, height & !1)
        } else {
            (width, height)
        };
        if width == 0
            || height == 0
            || u64::from(width) * u64::from(height) * 4 > pixels::MAX_FRAME_BYTES as u64
        {
            return Err(error("Invalid or oversized capture dimensions"));
        }
        let mut reader = Self {
            connection,
            screen,
            target,
            pixmap: None,
            region,
            width,
            height,
            cursor: super::super::pipewire::CursorClassifier::system(),
            last_monitor_check: Instant::now(),
        };
        if let Some(window) = reader.target.window {
            reader
                .connection
                .change_window_attributes(
                    window,
                    &ChangeWindowAttributesAux::new().event_mask(EventMask::STRUCTURE_NOTIFY),
                )
                .map_err(error)?
                .check()
                .map_err(error)?;
            reader
                .connection
                .composite_query_version(0, 4)
                .map_err(error)?
                .reply()
                .map_err(error)?;
            reader
                .connection
                .composite_redirect_window(window, Redirect::AUTOMATIC)
                .map_err(error)?
                .check()
                .map_err(error)?;
            reader.name_pixmap()?;
        }
        Ok(reader)
    }
    fn name_pixmap(&mut self) -> Result<(), CaptureError> {
        if let Some(old) = self.pixmap.take() {
            self.connection
                .free_pixmap(old)
                .map_err(error)?
                .check()
                .map_err(error)?;
        }
        let id = self.connection.generate_id().map_err(error)?;
        self.connection
            .composite_name_window_pixmap(
                self.target.window.ok_or_else(|| error("Missing window"))?,
                id,
            )
            .map_err(error)?
            .check()
            .map_err(error)?;
        self.pixmap = Some(id);
        Ok(())
    }
    pub(crate) fn format(&self) -> VideoFormat {
        VideoFormat {
            width: self.width,
            height: self.height,
            stride: self.width as usize * 4,
            pixel_format: PixelFormat::Bgra8,
        }
    }
    pub(crate) fn bounds(&self) -> crate::screen::SelectionBounds {
        self.target.bounds.clone()
    }
    fn refresh_target(&mut self) -> Result<(), CaptureError> {
        while let Some(event) = self.connection.poll_for_event().map_err(error)? {
            if let Event::DestroyNotify(event) = event
                && Some(event.window) == self.target.window
            {
                return Err(error("The selected window was closed"));
            }
        }
        if let Some(window) = self.target.window {
            let next = desktop::window_target(&self.connection, self.target.root, window)?;
            let resized = (next.bounds.width, next.bounds.height)
                != (self.target.bounds.width, self.target.bounds.height);
            self.target = next;
            if resized {
                self.name_pixmap()?;
            }
        } else if self.last_monitor_check.elapsed() > Duration::from_secs(1) {
            let id = SourceId::new(self.target.id.clone())?;
            let next = desktop::resolve(&self.connection, self.screen, &id)?;
            if next.bounds != self.target.bounds {
                return Err(error("The selected monitor geometry changed"));
            }
            self.last_monitor_check = Instant::now();
        }
        Ok(())
    }
    pub(crate) fn read(
        &mut self,
        show_cursor: bool,
        track_cursor: bool,
    ) -> Result<(OwnedVideoFrame, CursorSampleState, Instant), CaptureError> {
        self.refresh_target()?;
        let window = self.target.window.is_some();
        let full = &self.target.bounds;
        let (mut x, mut y, mut width, mut height) = if window {
            (0, 0, full.width, full.height)
        } else {
            (full.x, full.y, full.width, full.height)
        };
        if let Some(region) = self.region {
            let crop = crate::screen::normalize_crop(region, width, height)?;
            x += crop.start_x as i32;
            y += crop.start_y as i32;
            width = crop.width();
            height = crop.height();
        }
        if !window {
            width = self.width;
            height = self.height;
        }
        if width == 0
            || height == 0
            || u64::from(width) * u64::from(height) * 4 > pixels::MAX_FRAME_BYTES as u64
        {
            return Err(error("Resized frame exceeds capture limits"));
        }
        let reply = self
            .connection
            .get_image(
                ImageFormat::Z_PIXMAP,
                self.pixmap.unwrap_or(self.target.root),
                i16::try_from(x).map_err(error)?,
                i16::try_from(y).map_err(error)?,
                u16::try_from(width).map_err(error)?,
                u16::try_from(height).map_err(error)?,
                u32::MAX,
            )
            .map_err(error)?
            .reply()
            .map_err(error)?;
        let captured_at = Instant::now();
        let setup = self.connection.setup();
        let format = setup
            .pixmap_formats
            .iter()
            .find(|format| format.depth == reply.depth)
            .ok_or_else(|| error("Unknown X11 pixmap depth"))?;
        let visual = setup.roots[self.screen]
            .allowed_depths
            .iter()
            .flat_map(|depth| &depth.visuals)
            .find(|visual| visual.visual_id == self.target.visual)
            .ok_or_else(|| error("Unknown X11 visual"))?;
        let layout = Layout {
            bits: format.bits_per_pixel,
            pad: format.scanline_pad,
            little_endian: setup.image_byte_order == ImageOrder::LSB_FIRST,
            red: visual.red_mask,
            green: visual.green_mask,
            blue: visual.blue_mask,
        };
        let mut frame = pixels::decode(&reply.data, width, height, layout)?;
        let mut cursor = CursorSampleState::Unknown;
        if track_cursor || show_cursor {
            let image = self
                .connection
                .xfixes_get_cursor_image()
                .map_err(error)?
                .reply()
                .map_err(error)?;
            let origin_x = if window { self.target.bounds.x } else { x };
            let origin_y = if window { self.target.bounds.y } else { y };
            let pixel_x = i32::from(image.x) - origin_x;
            let pixel_y = i32::from(image.y) - origin_y;
            let visible =
                pixel_x >= 0 && pixel_y >= 0 && pixel_x < width as i32 && pixel_y < height as i32;
            let bitmap: Vec<u8> = image
                .cursor_image
                .iter()
                .flat_map(|pixel| pixel.to_le_bytes())
                .collect();
            let hotspot = Hotspot {
                x: u32::from(image.xhot),
                y: u32::from(image.yhot),
            };
            let kind = self.cursor.classify(
                u64::from(image.cursor_serial),
                pipewire::spa::param::video::VideoFormat::BGRA,
                u32::from(image.width),
                u32::from(image.height),
                i32::from(image.width) * 4,
                &bitmap,
                hotspot,
            );
            if show_cursor && visible {
                blend_cursor(
                    &mut frame,
                    pixel_x - i32::from(image.xhot),
                    pixel_y - i32::from(image.yhot),
                    u32::from(image.width),
                    &bitmap,
                );
            }
            let (left, top, fitted_width, fitted_height) =
                pixels::fit_rect(width, height, self.width, self.height);
            let mapped_x =
                f64::from(left) + f64::from(pixel_x) * f64::from(fitted_width) / f64::from(width);
            let mapped_y =
                f64::from(top) + f64::from(pixel_y) * f64::from(fitted_height) / f64::from(height);
            cursor = CursorSampleState::Known {
                native_cursor_id: format!("x11:cursor:{}", image.cursor_serial),
                cursor_kind: kind,
                pixel_x: mapped_x.round() as i32,
                pixel_y: mapped_y.round() as i32,
                normalized_x: mapped_x / f64::from(self.width),
                normalized_y: mapped_y / f64::from(self.height),
                visible,
                hotspot: Some(hotspot),
            };
        }
        Ok((
            pixels::fit(frame, self.width, self.height),
            cursor,
            captured_at,
        ))
    }
}
impl Drop for Reader {
    fn drop(&mut self) {
        if let Some(pixmap) = self.pixmap.take() {
            let _ = self.connection.free_pixmap(pixmap);
        }
        if let Some(window) = self.target.window {
            let _ = self
                .connection
                .composite_unredirect_window(window, Redirect::AUTOMATIC);
        }
        let _ = self.connection.flush();
    }
}
fn blend_cursor(frame: &mut OwnedVideoFrame, left: i32, top: i32, width: u32, bitmap: &[u8]) {
    if width == 0 {
        return;
    }
    let pixels = Arc::make_mut(&mut frame.pixels);
    for (index, cursor) in bitmap.as_chunks::<4>().0.iter().enumerate() {
        let x = left + (index % width as usize) as i32;
        let y = top + (index / width as usize) as i32;
        if x < 0 || y < 0 || x >= frame.width as i32 || y >= frame.height as i32 {
            continue;
        }
        let offset = y as usize * frame.stride + x as usize * 4;
        for channel in 0..3 {
            pixels[offset + channel] = (u16::from(cursor[channel])
                + u16::from(pixels[offset + channel]) * (255 - u16::from(cursor[3])) / 255)
                .min(255) as u8;
        }
    }
}

#[cfg(test)]
#[path = "cursor_tests.rs"]
mod tests;
