use std::collections::HashSet;

use crate::{CaptureError, model::TrackId};

#[derive(Debug)]
pub struct StartBarrier {
    expected: HashSet<TrackId>,
    armed: HashSet<TrackId>,
}

impl StartBarrier {
    #[must_use]
    pub fn new(expected: impl IntoIterator<Item = TrackId>) -> Self {
        Self {
            expected: expected.into_iter().collect(),
            armed: HashSet::new(),
        }
    }
    pub fn arm(&mut self, track: TrackId) -> Result<bool, CaptureError> {
        if !self.expected.contains(&track) {
            return Err(CaptureError::InvalidConfiguration(format!(
                "unexpected track {track}"
            )));
        }
        self.armed.insert(track);
        Ok(self.is_ready())
    }
    #[must_use]
    pub fn is_ready(&self) -> bool {
        self.expected == self.armed
    }
}
