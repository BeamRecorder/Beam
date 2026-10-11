use std::sync::{Arc, Mutex};

struct State<T> {
    free: Vec<Arc<T>>,
    allocated: usize,
    limit: usize,
}

/// Counts every owned surface, including queued, processed and retained frames.
/// A lease returns only when its final consumer releases it.
pub(crate) struct FramePool<T> {
    state: Arc<Mutex<State<T>>>,
}
pub(crate) struct FrameLease<T> {
    value: Arc<T>,
    state: Arc<Mutex<State<T>>>,
}

impl<T> FramePool<T> {
    pub(crate) fn new(limit: usize) -> Self {
        Self {
            state: Arc::new(Mutex::new(State {
                free: Vec::new(),
                allocated: 0,
                limit,
            })),
        }
    }
    pub(crate) fn available(&self) -> bool {
        let state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        !state.free.is_empty() || state.allocated < state.limit
    }
    pub(crate) fn acquire<E>(
        &self,
        create: impl FnOnce() -> Result<T, E>,
    ) -> Result<Option<Arc<FrameLease<T>>>, E> {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let value = if let Some(value) = state.free.pop() {
            value
        } else {
            if state.allocated >= state.limit {
                return Ok(None);
            }
            // Allocation is serialized; failed allocations never occupy a slot.
            let value = Arc::new(create()?);
            state.allocated += 1;
            value
        };
        Ok(Some(Arc::new(FrameLease {
            value,
            state: self.state.clone(),
        })))
    }
}

impl<T> FrameLease<T> {
    pub(crate) fn value(&self) -> &T {
        &self.value
    }
}
impl<T> Drop for FrameLease<T> {
    fn drop(&mut self) {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .free
            .push(self.value.clone());
    }
}

#[cfg(test)]
#[path = "frame_pool_tests.rs"]
mod tests;
