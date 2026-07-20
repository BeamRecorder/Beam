use std::sync::{Arc, Mutex};

use crate::{CaptureError, model::HealthEvent};

#[derive(Debug, Clone, Default)]
pub struct HealthLog {
    events: Arc<Mutex<Vec<HealthEvent>>>,
}

impl HealthLog {
    pub fn record(&self, event: HealthEvent) -> Result<(), CaptureError> {
        self.events
            .lock()
            .map_err(|_| CaptureError::Backend("health log lock poisoned".into()))?
            .push(event);
        Ok(())
    }
    pub fn snapshot(&self) -> Result<Vec<HealthEvent>, CaptureError> {
        Ok(self
            .events
            .lock()
            .map_err(|_| CaptureError::Backend("health log lock poisoned".into()))?
            .clone())
    }
}
