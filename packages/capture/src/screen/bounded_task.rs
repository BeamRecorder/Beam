use crate::CaptureError;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

#[derive(Clone, Default)]
pub(crate) struct NativeOperations {
    busy: Arc<AtomicBool>,
}
struct OperationGuard(Arc<AtomicBool>);
impl Drop for OperationGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl NativeOperations {
    /// A timed-out native call cannot be forcibly unwound safely. Quarantine
    /// this engine's native operations until that worker actually returns;
    /// repeated retries must not accumulate blocked threads and GPU devices.
    pub(crate) fn run<T: Send + 'static>(
        &self,
        name: &'static str,
        timeout: Duration,
        operation: impl FnOnce() -> Result<T, CaptureError> + Send + 'static,
    ) -> Result<T, CaptureError> {
        if self
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(CaptureError::Backend("a previous Windows capture operation is still blocked; recorded media was preserved".into()));
        }
        let guard = OperationGuard(self.busy.clone());
        let (sender, receiver) = crossbeam_channel::bounded(1);
        std::thread::Builder::new()
            .name(format!("beam-{name}"))
            .spawn(move || {
                let guard = guard;
                let result = operation();
                drop(guard);
                let _ = sender.send(result);
            })
            .map_err(|error| CaptureError::Backend(format!("could not start {name}: {error}")))?;
        receiver.recv_timeout(timeout).map_err(|error| {
            CaptureError::Backend(format!(
                "{name} did not finish: {error}; recorded media was preserved"
            ))
        })?
    }
}

#[cfg(test)]
#[path = "bounded_task_tests.rs"]
mod tests;
