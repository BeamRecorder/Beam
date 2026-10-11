use super::*;
impl RecordingSession {
    pub fn start(&mut self) -> Result<(), CaptureError> {
        if self.state != crate::session::SessionState::Armed {
            return Err(invalid_transition(self.state, "Recording"));
        }
        let start_gate = self
            .prepared_start_gate
            .take()
            .unwrap_or_else(|| Arc::new(crate::session::StartGate::new()));
        if !self.active.has_screen() {
            self.open_segment(0, &start_gate)?;
        }
        let t0 = self.clock.now_ns();
        self.manifest.session_start_monotonic_ns = t0;
        self.start_segment(&start_gate, t0, 0)?;
        self.commit_activation(0)
    }

    pub fn pause(&mut self) -> Result<(), CaptureError> {
        if self.state != crate::session::SessionState::Recording {
            return Err(invalid_transition(self.state, "Paused"));
        }
        let now = self.session_ns();
        #[cfg(target_os = "linux")]
        if matches!(
            self.request.screen,
            Some(crate::model::ScreenSelection::Portal { .. })
        ) {
            if let Err(error) = self.active.pause_portal(&mut self.manifest.tracks, now) {
                self.state = crate::session::SessionState::Failed;
                return Err(error);
            }
        } else {
            self.close_segment(now)?;
        }
        #[cfg(not(target_os = "linux"))]
        self.close_segment(now)?;
        self.state = crate::session::SessionState::Paused;
        self.checkpoint()
    }

    pub fn resume(&mut self) -> Result<(), CaptureError> {
        if self.state != crate::session::SessionState::Paused {
            return Err(invalid_transition(self.state, "Recording"));
        }
        let now = self.session_ns();
        let start_gate = Arc::new(crate::session::StartGate::new());
        #[cfg(target_os = "linux")]
        if matches!(
            self.request.screen,
            Some(crate::model::ScreenSelection::Portal { .. })
        ) {
            self.generation = self.generation.saturating_add(1);
            let result = self.active.resume_portal(OpenContext {
                request: &self.request,
                region_selection: &mut self.region_selection,
                snapshot: &self.snapshot,
                layout: &self.layout,
                generation: self.generation,
                start_ns: now,
                tracks: &mut self.manifest.tracks,
                start_gate: &start_gate,
            });
            if let Err(error) = result {
                start_gate.cancel();
                let _ = self.active.stop(&mut self.manifest.tracks, now);
                self.state = crate::session::SessionState::Failed;
                return Err(error);
            }
        } else {
            self.open_segment(now, &start_gate)?;
        }
        #[cfg(not(target_os = "linux"))]
        self.open_segment(now, &start_gate)?;
        let actual_start_ns = self.session_ns();
        for track in &mut self.manifest.tracks {
            if track.status == TrackStatus::Recording
                && let Some(segment) = track.segments.last_mut()
            {
                segment.start_ns = actual_start_ns;
            }
        }
        self.start_segment(&start_gate, self.clock.now_ns(), actual_start_ns)?;
        self.commit_activation(actual_start_ns)
    }

    fn commit_activation(&mut self, now: u64) -> Result<(), CaptureError> {
        self.state = crate::session::SessionState::Recording;
        let result = write_timing_anchors(&self.layout, &self.manifest.tracks, now)
            .and_then(|()| self.checkpoint());
        if let Err(error) = &result {
            let _ = self.active.stop(&mut self.manifest.tracks, now);
            self.state = crate::session::SessionState::Failed;
            self.recording_error
                .get_or_insert_with(|| error.to_string());
        }
        result
    }
}
