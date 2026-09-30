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

pub fn prepare(points: &[CursorPoint], style: &CursorStyle) -> CursorIndex {
    let mut index = CursorIndex::default();
    for (i, p) in points.iter().enumerate() {
        if i == 0
            || !matches!(p.interaction_type, None | Some(CursorInteractionType::Move))
            || p.visible != points[i - 1].visible
            || p.cursor_type != points[i - 1].cursor_type
            || (p.cx - points[i - 1].cx).abs() > 0.00001
            || (p.cy - points[i - 1].cy).abs() > 0.00001
        {
            index.activity.push(p.time_ms);
        }
        if is_click(p) {
            index.clicks.push(p.time_ms);
        }
    }
    index.motion = super::cursor_motion::prepare(points, &style.motion);
    index.settings = style.motion.clone();
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
    source_at_prepared(points, &prepare(points, style), style, time_ms)
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
    let latest = end.checked_sub(1).and_then(|i| points.get(i))?;
    if latest.visible == Some(false) {
        return None;
    }
    let position = if style.smoothing_ms == 0 || style.motion.smoothing == 0. {
        playback::cursor_at(points, time_ms).map(|p| (p.x, p.y))?
    } else {
        super::cursor_motion::at(points, &index.motion, &style.motion, time_ms)?
    };
    let last = index
        .activity
        .partition_point(|time| *time as f64 <= time_ms)
        .checked_sub(1)
        .and_then(|i| index.activity.get(i))?;
    let elapsed = (time_ms - *last as f64).max(0.);
    let opacity = if style.hide_after_ms == 0 {
        1.
    } else {
        let age = elapsed - style.hide_after_ms as f64;
        if style.fade_duration_ms == 0 {
            if age >= 0. { 0. } else { 1. }
        } else {
            (1. - age / style.fade_duration_ms as f64).clamp(0., 1.)
        }
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
