use std::sync::{
    Condvar, Mutex,
    atomic::{AtomicU8, Ordering},
};

use crate::CaptureError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GateState {
    Armed,
    Started { t0_ns: u64 },
    Cancelled,
}

/// Shared one-shot signal used by prepared native backends.
#[derive(Debug)]
pub struct StartGate {
    state: Mutex<GateState>,
    fast_state: AtomicU8,
    changed: Condvar,
}

impl StartGate {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            state: Mutex::new(GateState::Armed),
            fast_state: AtomicU8::new(0),
            changed: Condvar::new(),
        }
    }

    pub fn release(&self, t0_ns: u64) -> Result<(), CaptureError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| CaptureError::Backend("start gate lock poisoned".into()))?;
        if *state != GateState::Armed {
            return Err(CaptureError::InvalidTransition {
                from: format!("{state:?}"),
                to: "Started".into(),
            });
        }
        *state = GateState::Started { t0_ns };
        self.fast_state.store(1, Ordering::Release);
        self.changed.notify_all();
        Ok(())
    }

    pub fn cancel(&self) {
        if let Ok(mut state) = self.state.lock()
            && *state == GateState::Armed
        {
            *state = GateState::Cancelled;
            self.fast_state.store(2, Ordering::Release);
            self.changed.notify_all();
        }
    }

    pub fn wait(&self) -> Result<u64, CaptureError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| CaptureError::Backend("start gate lock poisoned".into()))?;
        while *state == GateState::Armed {
            state = self
                .changed
                .wait(state)
                .map_err(|_| CaptureError::Backend("start gate lock poisoned".into()))?;
        }
        match *state {
            GateState::Started { t0_ns } => Ok(t0_ns),
            GateState::Cancelled => Err(CaptureError::Backend(
                "recording cancelled before the start barrier".into(),
            )),
            GateState::Armed => Err(CaptureError::Backend("start gate woke while armed".into())),
        }
    }

    #[must_use]
    pub fn is_released(&self) -> bool {
        self.fast_state.load(Ordering::Acquire) == 1
    }
}

impl Default for StartGate {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for StartGate {
    fn drop(&mut self) {
        self.cancel();
    }
}
