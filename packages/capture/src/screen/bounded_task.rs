use crate::CaptureError;
use std::{
    cell::Cell,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

thread_local! {
    static WORKER_CONTEXT: Cell<usize> = const { Cell::new(0) };
}
struct WorkerContext(usize);
impl Drop for WorkerContext {
    fn drop(&mut self) {
        WORKER_CONTEXT.set(self.0);
    }
}

#[derive(Clone, Default)]
pub(crate) struct NativeOperations {
    busy: Arc<AtomicBool>,
}
struct OperationGuard(Arc<AtomicBool>);
struct NativeReply<T> {
    // On an abandoned reply, drop native resources on the worker while its
    // quarantine remains held. Field drop order here is intentional.
    result: Result<T, CaptureError>,
    guard: OperationGuard,
}
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
        let context = Arc::as_ptr(&self.busy) as usize;
        if WORKER_CONTEXT.get() == context {
            // Late startup results can own a recording whose Drop must stop
            // native capture. Cleanup stays in this already bounded worker;
            // a blocked destructor keeps its quarantine and spawns no retry.
            return operation();
        }
        if self
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(CaptureError::Backend("a previous Windows capture operation is still blocked; recorded media was preserved".into()));
        }
        let guard = OperationGuard(self.busy.clone());
        // Rendezvous transfers the result and its guard together. A buffered
        // late result could otherwise be dropped by the timed-out caller.
        let (sender, receiver) = crossbeam_channel::bounded(0);
        std::thread::Builder::new()
            .name(format!("beam-{name}"))
            .spawn(move || {
                let guard = guard;
                let _context = WorkerContext(WORKER_CONTEXT.replace(context));
                let result = operation();
                let _ = sender.send(NativeReply { result, guard });
            })
            .map_err(|error| CaptureError::Backend(format!("could not start {name}: {error}")))?;
        let reply = receiver.recv_timeout(timeout).map_err(|error| {
            CaptureError::Backend(format!(
                "{name} did not finish: {error}; recorded media was preserved"
            ))
        })?;
        drop(reply.guard);
        reply.result
    }
}

#[cfg(test)]
#[path = "bounded_task_tests.rs"]
mod tests;
