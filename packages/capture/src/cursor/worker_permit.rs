use crate::CaptureError;
use std::sync::atomic::{AtomicBool, Ordering};
static ACTIVE: AtomicBool = AtomicBool::new(false);

pub(crate) struct CursorWorkerPermit;
impl CursorWorkerPermit {
    pub(crate) fn acquire() -> Result<Self, CaptureError> {
        ACTIVE
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| {
                CaptureError::Backend(
                    "previous cursor worker is still stopping; its journal was preserved".into(),
                )
            })?;
        Ok(Self)
    }
}
impl Drop for CursorWorkerPermit {
    fn drop(&mut self) {
        ACTIVE.store(false, Ordering::Release);
    }
}
pub(crate) fn cursor_worker_active() -> bool {
    ACTIVE.load(Ordering::Acquire)
}
