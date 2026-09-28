//! One owned X11 drawable and its offscreen window pixmap.

use super::{DesktopBounds, Selection, backend_error, catalog::bounds, connect, pixels};
use crate::{
    CaptureError,
    cursor::{CursorKind, Hotspot},
    model::{CursorSelection, ScreenRegion},
    screen::{CursorSampleState, OwnedVideoFrame, PixelFormat, normalize_crop},
};
use std::sync::Arc;
use x11rb::{
    connection::Connection,
    protocol::{
        composite::{ConnectionExt as _, Redirect},
        xfixes::ConnectionExt as _,
        xproto::{ConnectionExt as _, ImageFormat, ImageOrder},
    },
    rust_connection::RustConnection,
};

pub(crate) struct Reader {
    connection: RustConnection,
    selection: Selection,
    pixmap: Option<(u32, u32)>,
    extent: DesktopBounds,
    region: Option<ScreenRegion>,
}

impl Reader {
    pub(crate) fn open(
        selection: Selection,
        region: Option<ScreenRegion>,
    ) -> Result<Self, CaptureError> {
        let (connection, _) = connect()?;
        let extent = bounds(&connection, selection)?;
        let window = match selection {
            Selection::Window(id) => id,
            Selection::Monitor { root, .. } => root,
        };
        let visual = connection
            .get_window_attributes(window)
            .map_err(backend_error)?
            .reply()
            .map_err(backend_error)?
            .visual;
        let true_color = connection
            .setup()
            .roots
            .iter()
            .flat_map(|screen| &screen.allowed_depths)
            .flat_map(|depth| &depth.visuals)
            .any(|entry| {
                entry.visual_id == visual
                    && entry.red_mask == 0xff_0000
                    && entry.green_mask == 0x00_ff00
                    && entry.blue_mask == 0x0000_00ff
            });
        if !true_color {
            return Err(CaptureError::Unsupported(
                "X11 capture requires an 8-bit RGB TrueColor visual".into(),
            ));
        }
        connection
            .xfixes_query_version(5, 0)
            .map_err(backend_error)?
            .reply()
            .map_err(backend_error)?;
        let mut reader = Self {
            connection,
            selection,
            pixmap: None,
            extent,
            region,
        };
        if let Selection::Window(window) = selection {
            reader
                .connection
                .composite_query_version(0, 4)
                .map_err(backend_error)?
                .reply()
                .map_err(backend_error)?;
            reader
                .connection
                .composite_redirect_window(window, Redirect::AUTOMATIC)
                .map_err(backend_error)?
                .check()
                .map_err(backend_error)?;
            let pixmap = reader.connection.generate_id().map_err(backend_error)?;
            // Remember ownership before naming so error cleanup releases redirection.
            reader.pixmap = Some((window, pixmap));
            reader
                .connection
                .composite_name_window_pixmap(window, pixmap)
                .map_err(backend_error)?
                .check()
                .map_err(backend_error)?;
        }
        Ok(reader)
    }

    pub(crate) fn frame(
        &mut self,
        cursor: CursorSelection,
    ) -> Result<(OwnedVideoFrame, CursorSampleState), CaptureError> {
        let current = bounds(&self.connection, self.selection)?;
        if (current.width != self.extent.width || current.height != self.extent.height)
            && let Some((window, old)) = self.pixmap
        {
            let pixmap = self.connection.generate_id().map_err(backend_error)?;
            self.connection
                .composite_name_window_pixmap(window, pixmap)
                .map_err(backend_error)?
                .check()
                .map_err(backend_error)?;
            self.pixmap = Some((window, pixmap));
            self.connection
                .free_pixmap(old)
                .map_err(backend_error)?
                .check()
                .map_err(backend_error)?;
        }
        self.extent = current;
        let crop = normalize_crop(
            self.region.unwrap_or(ScreenRegion {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            }),
            current.width,
            current.height,
        )?;
        let (drawable, x, y) = match self.selection {
            Selection::Window(window) => (
                self.pixmap.map_or(window, |(_, pixmap)| pixmap),
                crop.start_x as i32,
                crop.start_y as i32,
            ),
            Selection::Monitor { root, .. } => (
                root,
                current.x + crop.start_x as i32,
                current.y + crop.start_y as i32,
            ),
        };
        let reply = self
            .connection
            .get_image(
                ImageFormat::Z_PIXMAP,
                drawable,
                i16::try_from(x).map_err(backend_error)?,
                i16::try_from(y).map_err(backend_error)?,
                u16::try_from(crop.width()).map_err(backend_error)?,
                u16::try_from(crop.height()).map_err(backend_error)?,
                u32::MAX,
            )
            .map_err(backend_error)?
            .reply()
            .map_err(backend_error)?;
        let format = self
            .connection
            .setup()
            .pixmap_formats
            .iter()
            .find(|format| format.depth == reply.depth)
            .ok_or_else(|| CaptureError::Unsupported("unknown X11 pixel layout".into()))?;
        let mut pixels = pixels::bgra(
            &reply.data,
            crop.width(),
            crop.height(),
            format.bits_per_pixel,
            format.scanline_pad,
            self.connection.setup().image_byte_order == ImageOrder::LSB_FIRST,
        )?;
        let mut state = CursorSampleState::Unknown;
        if cursor != CursorSelection::Disabled {
            let pointer = self
                .connection
                .xfixes_get_cursor_image_and_name()
                .map_err(backend_error)?
                .reply()
                .map_err(backend_error)?;
            let px = i32::from(pointer.x) - current.x - crop.start_x as i32;
            let py = i32::from(pointer.y) - current.y - crop.start_y as i32;
            let visible =
                px >= 0 && py >= 0 && px < crop.width() as i32 && py < crop.height() as i32;
            let name = String::from_utf8_lossy(&pointer.name);
            state = CursorSampleState::Known {
                native_cursor_id: format!("x11:{}", pointer.cursor_serial),
                cursor_kind: kind(&name),
                pixel_x: px,
                pixel_y: py,
                normalized_x: f64::from(px) / f64::from(crop.width()),
                normalized_y: f64::from(py) / f64::from(crop.height()),
                visible,
                hotspot: Some(Hotspot {
                    x: u32::from(pointer.xhot),
                    y: u32::from(pointer.yhot),
                }),
            };
            if cursor == CursorSelection::Embedded && visible {
                blend_cursor(
                    &mut pixels,
                    (crop.width(), crop.height()),
                    px - i32::from(pointer.xhot),
                    py - i32::from(pointer.yhot),
                    pointer.width,
                    pointer.height,
                    &pointer.cursor_image,
                );
            }
        }
        Ok((
            OwnedVideoFrame {
                width: crop.width(),
                height: crop.height(),
                stride: crop.width() as usize * 4,
                pixel_format: PixelFormat::Bgra8,
                pixels: Arc::from(pixels),
            },
            state,
        ))
    }
}

fn kind(name: &str) -> CursorKind {
    match name {
        "text" | "xterm" | "ibeam" => CursorKind::Textcursor,
        "pointer" | "hand1" | "hand2" => CursorKind::Handpointing,
        _ => CursorKind::Default,
    }
}

fn blend_cursor(
    pixels: &mut [u8],
    frame_size: (u32, u32),
    left: i32,
    top: i32,
    cursor_width: u16,
    cursor_height: u16,
    cursor: &[u32],
) {
    let (width, height) = frame_size;
    for y in 0..i32::from(cursor_height) {
        for x in 0..i32::from(cursor_width) {
            let (px, py) = (left + x, top + y);
            if px < 0 || py < 0 || px >= width as i32 || py >= height as i32 {
                continue;
            }
            let Some(argb) = cursor.get(y as usize * usize::from(cursor_width) + x as usize) else {
                continue;
            };
            let alpha = argb >> 24;
            let offset = (py as usize * width as usize + px as usize) * 4;
            for channel in 0..3 {
                let source = (argb >> (channel * 8)) & 255;
                pixels[offset + channel] = (source
                    + u32::from(pixels[offset + channel]) * (255 - alpha) / 255)
                    .min(255) as u8;
            }
        }
    }
}

impl Drop for Reader {
    fn drop(&mut self) {
        if let Some((window, pixmap)) = self.pixmap.take() {
            let _ = self.connection.free_pixmap(pixmap);
            let _ = self
                .connection
                .composite_unredirect_window(window, Redirect::AUTOMATIC);
            let _ = self.connection.flush();
        }
    }
}

#[path = "../../../../test/screen/linux/x11/reader.rs"]
mod checks;
