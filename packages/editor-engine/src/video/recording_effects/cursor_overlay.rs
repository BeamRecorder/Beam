//! Captured click timing, native hotspot geometry and bounded motion trails.
use super::{cursor_raster, cursor_types::Sprite};
use crate::{MediaAsset, Result, video::pipeline::media};
use beam_editor_domain::recording::{
    cursor,
    cursor_style_types::{ClickEffect, RippleStyle},
    style_types::{CursorIndex, CursorSample, CursorStyle},
    types::CursorInteractionType,
};
use resvg::tiny_skia::{self, Pixmap, Transform};

pub fn rectangles(
    asset: &MediaAsset,
    index: &CursorIndex,
    style: &CursorStyle,
    sprite: &Sprite,
    time: f64,
    sample: CursorSample,
    opacity: f64,
    size: f64,
    click_opacity: f64,
) -> Result<Vec<gst_video::VideoOverlayRectangle>> {
    let mut values = vec![];
    let recent = index.clicks.partition_point(|t| *t as f64 <= time);
    let start = index.clicks.partition_point(|t| (*t as f64) < time - 500.);
    let mut scale = size;
    for click_time in &index.clicks[start..recent] {
        let offset = asset.cursor.partition_point(|p| p.time_ms < *click_time);
        let point = asset.cursor[offset..]
            .iter()
            .take_while(|p| p.time_ms == *click_time)
            .find(|p| {
                matches!(
                    p.interaction_type,
                    Some(
                        CursorInteractionType::Click
                            | CursorInteractionType::DoubleClick
                            | CursorInteractionType::RightClick
                            | CursorInteractionType::MiddleClick
                    )
                )
            });
        let Some(point) = point else {
            continue;
        };
        let settings = if point.interaction_type == Some(CursorInteractionType::RightClick) {
            &style.click_effects.right
        } else {
            &style.click_effects.left
        };
        let age = (time - *click_time as f64) / 1000.;
        if style.clicks && settings.ripple_enabled {
            if let Some(raster) = ripple(settings, age)? {
                values.push(rectangle(
                    &raster,
                    asset,
                    point.cx,
                    point.cy,
                    opacity * click_opacity,
                    1.,
                )?);
            }
        }
        if style.clicks && Some(click_time) == index.clicks[..recent].last() {
            scale *= spring(age, settings);
        }
    }
    if style.motion.motion_blur > 0. {
        for frame in (1..=3).rev() {
            if let Some(previous) = cursor::source_at_prepared(
                &asset.cursor,
                index,
                style,
                time - f64::from(frame) * 1000. / 180.,
            ) && ((sample.x - previous.x) * f64::from(asset.width))
                .hypot((sample.y - previous.y) * f64::from(asset.height))
                > 0.5
            {
                values.push(rectangle(
                    sprite,
                    asset,
                    previous.x,
                    previous.y,
                    opacity * style.motion.motion_blur * 0.14,
                    scale,
                )?);
            }
        }
    }
    values.push(rectangle(
        sprite, asset, sample.x, sample.y, opacity, scale,
    )?);
    Ok(values)
}
pub fn rectangle(
    sprite: &Sprite,
    asset: &MediaAsset,
    x: f64,
    y: f64,
    opacity: f64,
    scale: f64,
) -> Result<gst_video::VideoOverlayRectangle> {
    let opacity = opacity.clamp(0., 1.);
    // GL overlay upload may apply global alpha in place. Keep cached artwork immutable.
    let buffer = if opacity == 1. {
        sprite.buffer.clone()
    } else {
        let mut buffer = sprite.buffer.copy_deep().map_err(media)?;
        {
            let mut bytes = buffer.make_mut().map_writable().map_err(media)?;
            for channel in bytes.as_mut_slice() {
                *channel = (f64::from(*channel) * opacity).round() as u8;
            }
        }
        buffer
    };
    Ok(gst_video::VideoOverlayRectangle::new_raw(
        &buffer,
        (x * f64::from(asset.width) - sprite.hotspot[0] * scale).round() as i32,
        (y * f64::from(asset.height) - sprite.hotspot[1] * scale).round() as i32,
        (f64::from(sprite.size[0]) * scale).round().max(1.) as u32,
        (f64::from(sprite.size[1]) * scale).round().max(1.) as u32,
        gst_video::VideoOverlayFormatFlags::PREMULTIPLIED_ALPHA,
    ))
}
/// Uses the original 70 ms press and damped release, shared by all seek orders.
pub fn spring(age: f64, effect: &ClickEffect) -> f64 {
    if !effect.spring_enabled || !(0. ..0.42).contains(&age) {
        return 1.;
    }
    let amplitude = 0.15 * effect.spring_intensity / 50.;
    if age < 0.07 {
        1. - amplitude * (1. - (1. - age / 0.07).powi(3))
    } else {
        let release = age - 0.07;
        1. - amplitude * (-10. * release).exp() * (28. * release).cos()
    }
}
fn ripple(effect: &ClickEffect, age: f64) -> Result<Option<Sprite>> {
    if !(0. ..=0.5).contains(&age) || effect.ripple_style == RippleStyle::None {
        return Ok(None);
    }
    let extent = (effect.ripple_size + 4.).ceil() as u32 * 2;
    let center = f64::from(extent) / 2.;
    let mut image =
        Pixmap::new(extent, extent).ok_or_else(|| media("cannot allocate click ripple"))?;
    let progress = age / 0.5;
    let radius = 2. + effect.ripple_size * (1. - (1. - progress).powi(3));
    ring(&mut image, center, radius, 1. - progress, false, effect)?;
    if effect.ripple_style == RippleStyle::Double && age >= 0.09 {
        let progress = (age - 0.09) / 0.41;
        ring(
            &mut image,
            center,
            2. + effect.ripple_size * 0.72 * (1. - (1. - progress).powi(3)),
            (1. - progress) * 0.85,
            false,
            effect,
        )?;
    }
    if effect.ripple_style == RippleStyle::Solid {
        let progress = (age / 0.32).min(1.);
        ring(
            &mut image,
            center,
            effect.ripple_size * 0.45 * (1. - progress * 0.4),
            (1. - progress) * 0.55,
            true,
            effect,
        )?;
    }
    Ok(Some(cursor_raster::from_pixmap(image, [center; 2])?))
}
fn ring(
    image: &mut Pixmap,
    center: f64,
    radius: f64,
    opacity: f64,
    filled: bool,
    effect: &ClickEffect,
) -> Result<()> {
    let circle = tiny_skia::PathBuilder::from_circle(center as f32, center as f32, radius as f32)
        .ok_or_else(|| media("invalid click ripple geometry"))?;
    let mut paint = tiny_skia::Paint::default();
    paint.set_color(
        tiny_skia::Color::from_rgba(
            effect.ripple_color[0] as f32,
            effect.ripple_color[1] as f32,
            effect.ripple_color[2] as f32,
            (effect.ripple_color[3] * opacity).clamp(0., 1.) as f32,
        )
        .ok_or_else(|| media("invalid ripple color"))?,
    );
    if filled {
        image.fill_path(
            &circle,
            &paint,
            tiny_skia::FillRule::Winding,
            Transform::identity(),
            None,
        );
    } else {
        image.stroke_path(
            &circle,
            &paint,
            &tiny_skia::Stroke {
                width: 2.,
                ..Default::default()
            },
            Transform::identity(),
            None,
        );
    }
    Ok(())
}
