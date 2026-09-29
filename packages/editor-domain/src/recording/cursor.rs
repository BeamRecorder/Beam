//! Source-time cursor smoothing, click pulses and hiding are seek-independent.
use super::{
    playback,
    style_types::{CursorIndex, CursorSample, CursorStyle},
    types::{CursorInteractionType, CursorPoint},
};
use crate::{
    Clip, MediaAsset, Result,
    timing::{Time, TimeSpace},
};

pub fn at(
    asset: &MediaAsset,
    clip: &Clip,
    style: &CursorStyle,
    sequence: Time,
) -> Result<Option<CursorSample>> {
    let source = crate::timing::map_time(clip, sequence, TimeSpace::Source)?.seconds() * 1000.;
    Ok(source_at(&asset.cursor, style, source))
}

pub fn prepare(points: &[CursorPoint]) -> CursorIndex {
    let mut index = CursorIndex::default();
    for (i, p) in points.iter().enumerate() {
        if i == 0
            || !matches!(p.interaction_type, None | Some(CursorInteractionType::Move))
            || (p.cx - points[i - 1].cx).abs() > 0.00001
            || (p.cy - points[i - 1].cy).abs() > 0.00001
        {
            index.activity.push(p.time_ms);
        }
        if is_click(p) {
            index.clicks.push(p.time_ms);
        }
    }
    index
}

pub fn at_prepared(
    asset: &MediaAsset,
    clip: &Clip,
    index: &CursorIndex,
    style: &CursorStyle,
    sequence: Time,
) -> Result<Option<CursorSample>> {
    let source = crate::timing::map_time(clip, sequence, TimeSpace::Source)?.seconds() * 1000.;
    Ok(source_at_prepared(&asset.cursor, index, style, source))
}

pub fn source_at(
    points: &[CursorPoint],
    style: &CursorStyle,
    time_ms: f64,
) -> Option<CursorSample> {
    source_at_prepared(points, &prepare(points), style, time_ms)
}

pub fn source_at_prepared(
    points: &[CursorPoint],
    index: &CursorIndex,
    style: &CursorStyle,
    time_ms: f64,
) -> Option<CursorSample> {
    if !style.enabled || !time_ms.is_finite() || time_ms < 0. {
        return None;
    }
    let end = points.partition_point(|p| p.time_ms as f64 <= time_ms);
    end.checked_sub(1).and_then(|i| points.get(i))?;
    let position = smoothed(points, time_ms, style.smoothing_ms)?;
    let last = index
        .activity
        .partition_point(|time| *time as f64 <= time_ms)
        .checked_sub(1)
        .and_then(|i| index.activity.get(i))?;
    let elapsed = (time_ms - *last as f64).max(0.);
    let opacity = if style.hide_after_ms == 0 {
        1.
    } else {
        (1. - (elapsed - style.hide_after_ms as f64) / 200.).clamp(0., 1.)
    };
    let click = if style.clicks {
        index
            .clicks
            .partition_point(|time| *time as f64 <= time_ms)
            .checked_sub(1)
            .and_then(|i| index.clicks.get(i))
            .filter(|time| time_ms - (**time as f64) < 350.)
            .map(|time| (time_ms - *time as f64) / 350.)
    } else {
        None
    };
    Some(CursorSample {
        x: position.0,
        y: position.1,
        opacity,
        click,
    })
}
fn is_click(point: &CursorPoint) -> bool {
    matches!(
        point.interaction_type,
        Some(
            CursorInteractionType::Click
                | CursorInteractionType::DoubleClick
                | CursorInteractionType::RightClick
                | CursorInteractionType::MiddleClick
        )
    )
}

/// A fixed convolution window means unrelated seek order cannot affect smoothing.
fn smoothed(points: &[CursorPoint], time_ms: f64, smoothing_ms: u64) -> Option<(f64, f64)> {
    if smoothing_ms == 0 {
        return playback::cursor_at(points, time_ms).map(|p| (p.x, p.y));
    }
    let window = smoothing_ms as f64 * 4.;
    let (mut x, mut y, mut total) = (0., 0., 0.);
    for step in 0..=32 {
        let lag = window * step as f64 / 32.;
        let weight = (-lag / smoothing_ms as f64).exp();
        let p = playback::cursor_at(points, (time_ms - lag).max(points[0].time_ms as f64))?;
        x += p.x * weight;
        y += p.y * weight;
        total += weight;
    }
    Some((x / total, y / total))
}
