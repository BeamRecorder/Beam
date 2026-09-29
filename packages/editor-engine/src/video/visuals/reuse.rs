//! Pool equal/finer completed bins without retaining decoded PCM.
use super::types::Waveform;

/// Copies only fully covered bins; gaps and insufficient detail remain pending.
pub fn pool(target: &mut Waveform, slices: impl Iterator<Item = Waveform>) {
    let slices: Vec<_> = slices.collect();
    for index in 0..target.points.len() {
        let start = target.start_ms + index as u64 * target.step_ms;
        let end = (start + target.step_ms).min(target.start_ms + target.duration_ms);
        let mut cursor = start;
        let mut amplitudes = [0_f32; 5];
        while cursor < end {
            let covering = slices
                .iter()
                .filter(|slice| {
                    slice.step_ms <= target.step_ms
                        && cursor >= slice.start_ms
                        && cursor < slice.start_ms + slice.duration_ms
                })
                .filter_map(|slice| {
                    let point = ((cursor - slice.start_ms) / slice.step_ms) as usize;
                    if !slice.ready.get(point).copied().unwrap_or(false) {
                        return None;
                    }
                    let point_start = slice.start_ms + point as u64 * slice.step_ms;
                    // Avoid importing extrema from outside the requested bin.
                    let point_end =
                        (point_start + slice.step_ms).min(slice.start_ms + slice.duration_ms);
                    (point_start >= start && point_end <= end)
                        .then_some((point_end, slice.points[point]))
                })
                .max_by_key(|(end, _)| *end);
            let Some((next, peak)) = covering else {
                break;
            };
            for band in 0..5 {
                amplitudes[band] = amplitudes[band].max(peak[band]);
            }
            cursor = next;
        }
        if cursor == end {
            target.points[index] = amplitudes;
            target.ready[index] = true;
        }
    }
}
