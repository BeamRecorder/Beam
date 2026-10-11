use std::sync::{
    Condvar, Mutex,
    atomic::{AtomicU8, Ordering},
};

use crate::CaptureError;
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GateState {
    Armed,
    Started {
        t0_ns: u64,
        session_ns: u64,
        started_at: Instant,
    },
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
        self.release_at(t0_ns, 0)
    }

    pub(crate) fn release_at(&self, t0_ns: u64, session_ns: u64) -> Result<(), CaptureError> {
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
        *state = GateState::Started {
            t0_ns,
            session_ns,
            started_at: Instant::now(),
        };
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
            GateState::Started { t0_ns, .. } => Ok(t0_ns),
            GateState::Cancelled => Err(CaptureError::Backend(
                "recording cancelled before the start barrier".into(),
            )),
            GateState::Armed => Err(CaptureError::Backend("start gate woke while armed".into())),
        }
    }

    pub(crate) fn session_time_ns(&self) -> Result<u64, CaptureError> {
        self.wait()?;
        let state = self
            .state
            .lock()
            .map_err(|_| CaptureError::Backend("start gate lock poisoned".into()))?;
        match *state {
            GateState::Started {
                session_ns,
                started_at,
                ..
            } => Ok(session_ns.saturating_add(
                u64::try_from(started_at.elapsed().as_nanos()).unwrap_or(u64::MAX),
            )),
            _ => Err(CaptureError::Cancelled),
        }
    }

    #[must_use]
    pub fn is_released(&self) -> bool {
        self.fast_state.load(Ordering::Acquire) == 1
    }

    #[cfg(windows)]
    pub(crate) fn elapsed_since_release(&self) -> Option<std::time::Duration> {
        match *self.state.lock().ok()? {
            GateState::Started { started_at, .. } => Some(started_at.elapsed()),
            _ => None,
        }
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
