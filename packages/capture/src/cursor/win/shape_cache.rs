use super::WindowsCursorShape;
use crate::CaptureError;
use std::time::{Duration, Instant};

#[derive(Default)]
pub(super) struct ShapeCache {
    cached: Option<(WindowsCursorShape, Instant)>,
}
impl ShapeCache {
    pub(super) fn resolve(
        &mut self,
        native_id: usize,
        now: Instant,
        load: impl FnOnce() -> Result<WindowsCursorShape, CaptureError>,
    ) -> Result<WindowsCursorShape, CaptureError> {
        if let Some((shape, loaded)) = &self.cached
            && shape.native_id == native_id
            && now.saturating_duration_since(*loaded) < Duration::from_secs(2)
        {
            return Ok(shape.clone());
        }
        let shape = load()?;
        self.cached = Some((shape.clone(), now));
        Ok(shape)
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    use super::*;
    use crate::cursor::{CursorKind, Hotspot};
    fn shape(id: usize) -> WindowsCursorShape {
        WindowsCursorShape {
            native_id: id,
            cursor_kind: CursorKind::Default,
            hotspot: Hotspot { x: 0, y: 0 },
        }
    }
    #[test]
    fn hours_of_polling_do_not_allocate_gdi_bitmaps_on_every_sample() {
        let mut cache = ShapeCache::default();
        let now = Instant::now();
        let mut loads = 0;
        for sample in 0..125 * 3600 {
            cache
                .resolve(42, now + Duration::from_millis(sample * 8), || {
                    loads += 1;
                    Ok(shape(42))
                })
                .expect("shape");
        }
        assert_eq!(loads, 1800);
    }
    #[test]
    fn changed_handles_and_expired_handles_are_reclassified() {
        let mut cache = ShapeCache::default();
        let now = Instant::now();
        let mut loads = 0;
        for (id, ms) in [(1, 0), (1, 1), (2, 2), (2, 2002), (1, 2003)] {
            assert_eq!(
                cache
                    .resolve(id, now + Duration::from_millis(ms), || {
                        loads += 1;
                        Ok(shape(id))
                    })
                    .expect("shape")
                    .native_id,
                id
            );
        }
        assert_eq!(loads, 4);
    }
    #[test]
    fn failed_shape_reads_are_retried_instead_of_cached() {
        let mut cache = ShapeCache::default();
        let now = Instant::now();
        assert!(
            cache
                .resolve(1, now, || Err(CaptureError::Cancelled))
                .is_err()
        );
        assert_eq!(
            cache
                .resolve(1, now, || Ok(shape(1)))
                .expect("retry")
                .native_id,
            1
        );
    }
}
