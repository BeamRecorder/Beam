//! Placement ported from Vue's zoom-placement.ts, including reserved ranges.
use super::types::Interval;

/// Fits a zoom into the free gap containing its anchor, with a 200 ms minimum.
pub fn fit(anchor: u64, preferred: u64, duration: u64, occupied: &[Interval]) -> Option<Interval> {
    if duration == 0 {
        return None;
    }
    let anchor = anchor.min(duration);
    let mut ranges: Vec<_> = occupied
        .iter()
        .map(|r| Interval {
            start_ms: r.start_ms.min(duration),
            end_ms: r.end_ms.min(duration),
        })
        .filter(|r| r.end_ms > r.start_ms)
        .collect();
    ranges.sort_by_key(|r| (r.start_ms, r.end_ms));
    let mut merged: Vec<Interval> = Vec::new();
    for range in ranges {
        if let Some(last) = merged.last_mut().filter(|r| range.start_ms <= r.end_ms) {
            last.end_ms = last.end_ms.max(range.end_ms);
        } else {
            merged.push(range);
        }
    }
    let mut start = 0;
    for range in merged.into_iter().chain(std::iter::once(Interval {
        start_ms: duration,
        end_ms: duration,
    })) {
        if range.start_ms > start && anchor >= start && anchor <= range.start_ms {
            let available = range.start_ms - start;
            if available < 200 {
                return None;
            }
            let length = preferred.max(200).min(available);
            let left = (anchor as f64 - length as f64 / 2.)
                .round()
                .max(start as f64)
                .min((range.start_ms - length) as f64) as u64;
            return Some(Interval {
                start_ms: left,
                end_ms: left + length,
            });
        }
        start = start.max(range.end_ms);
    }
    None
}
