//! Carries captured cursor roles and visibility across pause segments into source time.
use beam_editor_domain::recording::types::CursorPoint;
use beam_screen::cursor::{CursorEvent, CursorTelemetryPoint};
use std::collections::BTreeSet;

/// Includes role/visibility boundaries even when the pointer is stationary.
pub fn points(
    telemetry: &[CursorTelemetryPoint],
    events: &[CursorEvent],
    start_ms: u64,
    duration: u64,
) -> Vec<CursorPoint> {
    let mut changes: Vec<_> = events
        .iter()
        .filter_map(|event| match event {
            CursorEvent::Shape {
                session_ns,
                cursor_kind,
                ..
            } => Some((
                session_ns / 1_000_000,
                Some(
                    serde_json::to_value(cursor_kind)
                        .expect("cursor vocabulary")
                        .as_str()
                        .expect("cursor role")
                        .to_owned(),
                ),
                None,
            )),
            CursorEvent::Visibility {
                session_ns,
                visible,
            }
            | CursorEvent::Move {
                session_ns,
                visible,
                ..
            } => Some((session_ns / 1_000_000, None, Some(*visible))),
            _ => None,
        })
        .collect();
    changes.sort_by_key(|change| change.0);
    let mut telemetry: Vec<_> = telemetry.iter().collect();
    telemetry.sort_by_key(|point| point.time_ms);
    let end = start_ms.saturating_add(duration);
    let mut times: BTreeSet<_> = telemetry
        .iter()
        .map(|p| p.time_ms)
        .chain(changes.iter().map(|p| p.0))
        .filter(|t| *t >= start_ms && *t < end)
        .collect();
    if duration > 0 && telemetry.first().is_some_and(|p| p.time_ms <= start_ms) {
        times.insert(start_ms);
    }
    let mut samples = vec![];
    let mut role = None;
    let mut visible = None;
    let mut index = 0;
    for time in times {
        while let Some(change) = changes.get(index).filter(|change| change.0 <= time) {
            if let Some(value) = &change.1 {
                role = Some(value.clone());
            }
            if let Some(value) = change.2 {
                visible = Some(value);
            }
            index += 1;
        }
        let count = telemetry.partition_point(|p| p.time_ms <= time);
        let Some(prior) = count.checked_sub(1).map(|i| telemetry[i]) else {
            continue;
        };
        let position = telemetry.get(count).map_or([prior.cx, prior.cy], |next| {
            let ratio = (time - prior.time_ms) as f64 / (next.time_ms - prior.time_ms) as f64;
            [
                prior.cx + (next.cx - prior.cx) * ratio,
                prior.cy + (next.cy - prior.cy) * ratio,
            ]
        });
        let exact = telemetry.partition_point(|p| p.time_ms < time);
        let captured: Vec<_> = telemetry[exact..count].iter().collect();
        if captured.is_empty() {
            samples.push(CursorPoint {
                time_ms: time - start_ms,
                cx: position[0],
                cy: position[1],
                interaction_type: None,
                cursor_type: role.clone(),
                visible,
            });
        } else {
            for p in captured {
                samples.push(CursorPoint {
                    time_ms: time - start_ms,
                    cx: p.cx,
                    cy: p.cy,
                    interaction_type: p.interaction_type.map(super::recording::interaction),
                    cursor_type: role.clone(),
                    visible,
                });
            }
        }
    }
    samples
}
