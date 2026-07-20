use crate::{CaptureError, clock::MonotonicClock};

use super::{PreparedTrack, SessionState, StartBarrier};

pub struct SessionCoordinator<C> {
    state: SessionState,
    clock: C,
    tracks: Vec<Box<dyn PreparedTrack>>,
}

impl<C: MonotonicClock> SessionCoordinator<C> {
    #[must_use]
    pub fn new(clock: C) -> Self {
        Self {
            state: SessionState::Idle,
            clock,
            tracks: Vec::new(),
        }
    }
    #[must_use]
    pub const fn state(&self) -> SessionState {
        self.state
    }
    pub fn prepare(&mut self, tracks: Vec<Box<dyn PreparedTrack>>) -> Result<(), CaptureError> {
        self.state = self.state.transition(SessionState::Preparing)?;
        let mut barrier = StartBarrier::new(tracks.iter().map(|track| track.track_id()));
        for track in &tracks {
            barrier.arm(track.track_id())?;
        }
        if !barrier.is_ready() {
            return Err(CaptureError::Backend("start barrier is incomplete".into()));
        }
        self.tracks = tracks;
        self.state = self.state.transition(SessionState::Armed)?;
        Ok(())
    }
    pub fn start(&mut self) -> Result<u64, CaptureError> {
        if self.state != SessionState::Armed {
            return Err(CaptureError::InvalidTransition {
                from: format!("{:?}", self.state),
                to: "Recording".into(),
            });
        }
        let t0 = self.clock.now_ns();
        let mut index = 0;
        while index < self.tracks.len() {
            let (previous_tracks, pending_tracks) = self.tracks.split_at_mut(index);
            if let Err(error) = pending_tracks[0].start(t0) {
                for previous in previous_tracks {
                    let _result = previous.stop(t0);
                }
                self.state = SessionState::Failed;
                return Err(error);
            }
            index += 1;
        }
        self.state = self.state.transition(SessionState::Recording)?;
        Ok(t0)
    }
    pub fn pause(&mut self) -> Result<u64, CaptureError> {
        let now = self.clock.now_ns();
        self.state = self.state.transition(SessionState::Paused)?;
        for track in &mut self.tracks {
            track.pause(now)?;
        }
        Ok(now)
    }
    pub fn resume(&mut self) -> Result<u64, CaptureError> {
        let now = self.clock.now_ns();
        self.state = self.state.transition(SessionState::Recording)?;
        for track in &mut self.tracks {
            track.resume(now)?;
        }
        Ok(now)
    }
    pub fn stop(&mut self) -> Result<u64, CaptureError> {
        if matches!(
            self.state,
            SessionState::Completed | SessionState::Stopping | SessionState::Finalizing
        ) {
            return Ok(self.clock.now_ns());
        }
        let now = self.clock.now_ns();
        self.state = self.state.transition(SessionState::Stopping)?;
        let mut first_error = None;
        for track in &mut self.tracks {
            if let Err(error) = track.stop(now) {
                first_error.get_or_insert(error);
            }
        }
        self.state = self.state.transition(SessionState::Finalizing)?;
        if let Some(error) = first_error {
            self.state = SessionState::Recoverable;
            return Err(error);
        }
        self.state = self.state.transition(SessionState::Completed)?;
        Ok(now)
    }
}

impl<C> Drop for SessionCoordinator<C> {
    fn drop(&mut self) {
        if matches!(
            self.state,
            SessionState::Recording | SessionState::Paused | SessionState::Degraded
        ) {
            for track in &mut self.tracks {
                let _result = track.stop(0);
            }
        }
    }
}
