//! Only cursor artwork is rasterized; captured video stays in OpenGL memory.
use super::{
    cursor_catalog,
    cursor_types::{Pack, RasterCache, Sprite},
};
use crate::{Result, video::pipeline::media};
use beam_editor_domain::recording::{
    cursor_style_types::ShadowDirection,
    style_types::{CursorShape, CursorStyle},
};
use resvg::tiny_skia::{self, Pixmap, Transform};
use std::sync::{Arc, OnceLock};

static CACHE: OnceLock<RasterCache> = OnceLock::new();

pub fn sprite(pack: &Pack, style: &CursorStyle, role: Option<&str>) -> Result<Arc<Sprite>> {
    let art = cursor_catalog::resolve(pack, &style.selection, role)?;
    let key = serde_json::to_string(&(
        pack.id.as_str(),
        art.id.as_str(),
        style.shape,
        style.size,
        style.color,
        &style.shadow,
    ))?;
    let cache = CACHE.get_or_init(Default::default);
    {
        let mut entries = cache.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(index) = entries.iter().position(|(id, _)| *id == key) {
            let entry = entries.remove(index).expect("existing cursor raster");
            let result = entry.1.clone();
            entries.push_back(entry);
            return Ok(result);
        }
    }
    let scale = style.size / art.nominal_size;
    let width = if style.shape == CursorShape::Dot {
        style.size
    } else {
        f64::from(art.intrinsic_size.width) * scale
    };
    let height = if style.shape == CursorShape::Dot {
        style.size
    } else {
        f64::from(art.intrinsic_size.height) * scale
    };
    if width > 512. || height > 512. || width <= 0. || height <= 0. {
        return Err(media("cursor raster exceeds its 512 pixel artwork budget"));
    }
    let margin = if style.shadow.enabled {
        (style.shadow.blur * 3. + 6.).ceil() as u32
    } else {
        2
    };
    let size = [
        width.ceil() as u32 + margin * 2,
        height.ceil() as u32 + margin * 2,
    ];
    let mut image =
        Pixmap::new(size[0], size[1]).ok_or_else(|| media("cannot allocate cursor raster"))?;
    let hotspot = if style.shape == CursorShape::Dot {
        let mut paint = tiny_skia::Paint::default();
        paint.set_color(
            tiny_skia::Color::from_rgba(
                style.color[0] as f32,
                style.color[1] as f32,
                style.color[2] as f32,
                style.color[3] as f32,
            )
            .ok_or_else(|| media("invalid cursor color"))?,
        );
        let center = margin as f32 + style.size as f32 / 2.;
        let circle = tiny_skia::PathBuilder::from_circle(center, center, style.size as f32 * 0.35)
            .ok_or_else(|| media("invalid dot cursor"))?;
        image.fill_path(
            &circle,
            &paint,
            tiny_skia::FillRule::Winding,
            Transform::identity(),
            None,
        );
        [f64::from(center); 2]
    } else {
        let bytes = cursor_catalog::bytes(pack, art)?;
        match art.format.as_str() {
            "svg" => {
                let mut source = String::from_utf8(bytes).map_err(media)?;
                if art.tintable.unwrap_or(pack.color_mode == "tintable") {
                    let color = format!(
                        "#{:02x}{:02x}{:02x}{:02x}",
                        (style.color[0] * 255.).round() as u8,
                        (style.color[1] * 255.).round() as u8,
                        (style.color[2] * 255.).round() as u8,
                        (style.color[3] * 255.).round() as u8
                    );
                    for original in ["#000000", "#000", "black"] {
                        for end in ['"', '\'', ';', ' ', '}'] {
                            source = source
                                .replace(&format!("{original}{end}"), &format!("{color}{end}"));
                        }
                    }
                }
                let options = resvg::usvg::Options {
                    image_href_resolver: resvg::usvg::ImageHrefResolver {
                        resolve_data: Box::new(|_, _, _| None),
                        resolve_string: Box::new(|_, _| None),
                    },
                    ..Default::default()
                };
                let tree = resvg::usvg::Tree::from_str(&source, &options).map_err(media)?;
                resvg::render(
                    &tree,
                    Transform::from_row(
                        scale as f32,
                        0.,
                        0.,
                        scale as f32,
                        margin as f32,
                        margin as f32,
                    ),
                    &mut image.as_mut(),
                );
            }
            "png" => {
                let source = Pixmap::decode_png(&bytes).map_err(media)?;
                if source.width() != art.intrinsic_size.width
                    || source.height() != art.intrinsic_size.height
                {
                    return Err(media("cursor PNG dimensions differ from its catalogue"));
                }
                image.draw_pixmap(
                    0,
                    0,
                    source.as_ref(),
                    &tiny_skia::PixmapPaint::default(),
                    Transform::from_row(
                        scale as f32,
                        0.,
                        0.,
                        scale as f32,
                        margin as f32,
                        margin as f32,
                    ),
                    None,
                );
            }
            _ => return Err(media("unsupported cursor artwork format")),
        }
        [
            art.hotspot.x * scale + f64::from(margin),
            art.hotspot.y * scale + f64::from(margin),
        ]
    };
    if style.shadow.enabled {
        image = shadow(image, style)?;
    }
    let result = Arc::new(from_pixmap(image, hotspot)?);
    let mut entries = cache.lock().unwrap_or_else(|p| p.into_inner());
    let bytes = |sprite: &Sprite| sprite.size[0] as usize * sprite.size[1] as usize * 4;
    while entries.len() >= 32
        || entries.iter().map(|(_, s)| bytes(s)).sum::<usize>() + bytes(&result) > 16 * 1024 * 1024
    {
        entries.pop_front();
    }
    entries.push_back((key, result.clone()));
    Ok(result)
}

pub fn from_pixmap(image: Pixmap, hotspot: [f64; 2]) -> Result<Sprite> {
    let size = [image.width(), image.height()];
    let mut bytes = image.take();
    for pixel in bytes.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    let mut buffer = gst::Buffer::from_mut_slice(bytes);
    gst_video::VideoMeta::add(
        buffer.get_mut().expect("owned sprite"),
        gst_video::VideoFrameFlags::empty(),
        gst_video::VideoFormat::Bgra,
        size[0],
        size[1],
    )
    .map_err(media)?;
    Ok(Sprite {
        buffer,
        size,
        hotspot,
    })
}

fn shadow(image: Pixmap, style: &CursorStyle) -> Result<Pixmap> {
    let width = image.width() as usize;
    let height = image.height() as usize;
    let mut alpha: Vec<f32> = image
        .data()
        .chunks_exact(4)
        .map(|p| f32::from(p[3]) / 255.)
        .collect();
    let radius = style.shadow.blur.ceil() as usize;
    if radius > 0 {
        // Three bounded separable box passes approximate the original Gaussian shadow.
        for _ in 0..3 {
            alpha = blur(&alpha, width, height, radius, true);
            alpha = blur(&alpha, width, height, radius, false);
        }
    }
    let distance = (style.shadow.blur * 0.4 + 2.).round() as i32;
    let (dx, dy) = match style.shadow.direction {
        ShadowDirection::All => (0, 0),
        ShadowDirection::Bottom => (0, distance),
        ShadowDirection::BottomRight => (distance, distance),
        ShadowDirection::TopLeft => (-distance, -distance),
    };
    let mut output = Pixmap::new(image.width(), image.height())
        .ok_or_else(|| media("cannot allocate cursor shadow"))?;
    for y in 0..height {
        for x in 0..width {
            let (sx, sy) = (x as i32 - dx, y as i32 - dy);
            if sx < 0 || sy < 0 || sx >= width as i32 || sy >= height as i32 {
                continue;
            }
            let a = alpha[sy as usize * width + sx as usize] * style.shadow.color[3] as f32;
            let pixel = &mut output.data_mut()[(y * width + x) * 4..][..4];
            for channel in 0..3 {
                pixel[channel] = (style.shadow.color[channel] as f32 * a * 255.).round() as u8;
            }
            pixel[3] = (a * 255.).round() as u8;
        }
    }
    output.draw_pixmap(
        0,
        0,
        image.as_ref(),
        &Default::default(),
        Transform::identity(),
        None,
    );
    Ok(output)
}
fn blur(values: &[f32], width: usize, height: usize, radius: usize, horizontal: bool) -> Vec<f32> {
    let mut result = vec![0.; values.len()];
    let (lines, length) = if horizontal {
        (height, width)
    } else {
        (width, height)
    };
    for line in 0..lines {
        let index = |position: usize| {
            if horizontal {
                line * width + position
            } else {
                position * width + line
            }
        };
        let mut sum = (0..=radius.min(length - 1))
            .map(|p| values[index(p)])
            .sum::<f32>();
        for p in 0..length {
            result[index(p)] = sum / (radius * 2 + 1) as f32;
            if p >= radius {
                sum -= values[index(p - radius)];
            }
            if p + radius + 1 < length {
                sum += values[index(p + radius + 1)];
            }
        }
    }
    result
}
