use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{Arc, RwLock},
};

#[derive(Debug)]
pub(crate) struct ResilientSource<T> {
    value: Arc<RwLock<T>>,
}

impl<T> Clone for ResilientSource<T> {
    fn clone(&self) -> Self {
        Self {
            value: self.value.clone(),
        }
    }
}

impl<T: Clone> ResilientSource<T> {
    pub(crate) fn new(initial: T) -> Self {
        Self {
            value: Arc::new(RwLock::new(initial)),
        }
    }

    pub(crate) fn current(&self) -> T {
        self.value
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub(crate) fn refresh<E>(&self, provider: impl FnOnce() -> Result<T, E>) -> bool {
        let Ok(Ok(value)) = catch_unwind(AssertUnwindSafe(provider)) else {
            return false;
        };
        *self
            .value
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = value;
        true
    }
}

#[cfg(test)]
#[path = "resilient_source_tests.rs"]
mod tests;
