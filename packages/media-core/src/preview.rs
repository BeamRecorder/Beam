use std::sync::Mutex;

/// A preview consumer sees only the newest frame; recording owns a separate path.
#[derive(Debug, Default)]
pub struct LatestFrame<T> {
    frame: Mutex<Option<T>>,
}

impl<T> LatestFrame<T> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            frame: Mutex::new(None),
        }
    }

    pub fn publish(&self, frame: T) -> Option<T> {
        self.frame
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .replace(frame)
    }

    pub fn take(&self) -> Option<T> {
        self.frame
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
    }
}
