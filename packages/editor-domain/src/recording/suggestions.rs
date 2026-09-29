//! Beam algorithm v8: group clicks within 2.5 seconds and prefer stronger clicks.
use super::{
    placement,
    types::{CursorInteractionType, CursorPoint, Interval, Zoom},
};

/// Normalizes native cursor samples without creating events for ordinary imports.
pub fn normalize(samples: &[CursorPoint], duration: u64) -> Vec<CursorPoint> {
    let mut points: Vec<_> = samples
        .iter()
        .filter(|p| p.cx.is_finite() && p.cy.is_finite())
        .cloned()
        .map(|mut p| {
            p.time_ms = p.time_ms.min(duration);
            p.cx = p.cx.clamp(0., 1.);
            p.cy = p.cy.clamp(0., 1.);
            p
        })
        .collect();
    points.sort_by_key(|p| p.time_ms);
    points
}

/// Suggests 1.5× source-time zooms from explicit clicks, preserving reserved intervals.
pub fn generate(samples: &[CursorPoint], duration: u64, reserved: &[Interval]) -> Vec<Zoom> {
    let points = normalize(samples, duration);
    let clicks: Vec<_> = points.iter().filter(|p| strength(p) > 0).collect();
    let mut result = Vec::new();
    let mut index = 0;
    while index < clicks.len() {
        let first = index;
        while index + 1 < clicks.len() && clicks[index + 1].time_ms - clicks[index].time_ms <= 2500
        {
            index += 1;
        }
        let mut best = clicks[first];
        for point in &clicks[first + 1..=index] {
            if strength(point) > strength(best) {
                best = point;
            }
        }
        let first_ms = clicks[first].time_ms;
        let last_ms = clicks[index].time_ms;
        let start = first_ms.saturating_sub(500);
        let end = last_ms.saturating_add(500).min(duration);
        if let Some(range) = placement::fit(
            (first_ms + last_ms) / 2,
            end.saturating_sub(start),
            duration,
            reserved,
        ) {
            result.push(Zoom {
                start_ms: range.start_ms,
                end_ms: range.end_ms,
                cx: best.cx,
                cy: best.cy,
                scale: 1.5,
            });
        }
        index += 1;
    }
    result
}
fn strength(point: &CursorPoint) -> u16 {
    match point.interaction_type {
        Some(CursorInteractionType::DoubleClick) => 1500,
        Some(CursorInteractionType::RightClick | CursorInteractionType::MiddleClick) => 1200,
        Some(CursorInteractionType::Click) => 900,
        _ => 0,
    }
}
