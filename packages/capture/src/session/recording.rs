use std::{path::PathBuf, sync::Arc};

use crate::{
    CaptureError,
    catalog::{CatalogSnapshot, validate_request},
    clock::{MonotonicClock, SessionClock},
    model::{
        CaptureRequest, PlatformMetadata, SCHEMA_VERSION, SessionId, SessionManifest, TrackKind,
        TrackStatus,
    },
    storage::{ManifestWriter, ProjectLayout, create_or_update_project, write_atomic},
};

use super::{
    recording_active::{ActiveRecordings, OpenContext},
    recording_support::*,
};

/// A prepared native recording session controlled by the JSONL engine.
pub struct RecordingSession {
    request: CaptureRequest,
    snapshot: CatalogSnapshot,
    session_id: SessionId,
    layout: crate::storage::SessionLayout,
    manifest: SessionManifest,
    writer: ManifestWriter,
    clock: SessionClock,
    state: super::SessionState,
    generation: u32,
    active: ActiveRecordings,
    project_layout: ProjectLayout,
    project_existed: bool,
    prepared_start_gate: Option<Arc<super::StartGate>>,
}

impl RecordingSession {
    pub fn prepare(
        request: CaptureRequest,
        snapshot: CatalogSnapshot,
    ) -> Result<Self, CaptureError> {
        validate_request(&request, &snapshot)?;
        ensure_free_space(
            &request.recording.output_root,
            request.recording.minimum_free_bytes,
        )?;
        let session_id = SessionId::new();
        let created_at_utc = now_utc()?;
        let project_layout = ProjectLayout::new(&request.recording.output_root, request.project_id);
        let project_existed = project_layout.project_manifest().exists();
        create_or_update_project(
            &request.recording.output_root,
            request.project_id,
            session_id,
            &created_at_utc,
        )?;
        let layout = project_layout.session(session_id);
        layout.create()?;
        let manifest = SessionManifest {
            schema_version: SCHEMA_VERSION,
            project_id: request.project_id,
            session_id,
            created_at_utc,
            session_start_monotonic_ns: 0,
            duration_ns: 0,
            platform: PlatformMetadata {
                os: std::env::consts::OS.into(),
                architecture: std::env::consts::ARCH.into(),
                backend: platform_backend().into(),
            },
            selected_sources: selected_sources(&request, &snapshot),
            tracks: track_metadata(&request, &snapshot)?,
            permissions: snapshot.permissions.clone(),
            warnings: snapshot.limitations.clone(),
            completed: false,
        };
        let writer = ManifestWriter::new(layout.clone());
        writer.checkpoint(&manifest)?;
        checkpoint_tracks(&layout, &manifest.tracks)?;
        let session = Self {
            request,
            snapshot,
            session_id,
            layout,
            manifest,
            writer,
            clock: SessionClock::start(),
            state: super::SessionState::Armed,
            generation: 0,
            active: ActiveRecordings::default(),
            project_layout,
            project_existed,
            prepared_start_gate: None,
        };
        #[cfg(target_os = "linux")]
        let mut session = session;
        #[cfg(target_os = "linux")]
        if matches!(
            session.request.screen,
            Some(crate::model::ScreenSelection::Portal { .. })
        ) {
            let start_gate = Arc::new(super::StartGate::new());
            if let Err(error) = session
                .open_segment(0, &start_gate)
                .and_then(|()| session.checkpoint())
            {
                start_gate.cancel();
                let _ = session.active.stop(&mut session.manifest.tracks, 0);
                session.state = super::SessionState::Failed;
                let _ = session.remove_artifacts();
                return Err(error);
            }
            session.prepared_start_gate = Some(start_gate);
        }
        Ok(session)
    }

    #[must_use]
    pub const fn session_id(&self) -> SessionId {
        self.session_id
    }

    #[must_use]
    pub const fn state(&self) -> super::SessionState {
        self.state
    }

    #[must_use]
    pub fn manifest_path(&self) -> PathBuf {
        self.layout.manifest()
    }

    #[must_use]
    pub fn system_audio_level(&self) -> Option<f32> {
        self.active.system_audio_level()
    }

    #[must_use]
    pub fn screen_available(&self) -> bool {
        self.active.screen_available()
    }

    pub fn start(&mut self) -> Result<(), CaptureError> {
        if self.state != super::SessionState::Armed {
            return Err(invalid_transition(self.state, "Recording"));
        }
        let start_gate = self
            .prepared_start_gate
            .take()
            .unwrap_or_else(|| Arc::new(super::StartGate::new()));
        if !self.active.has_screen() {
            self.open_segment(0, &start_gate)?;
        }
        let t0 = self.clock.now_ns();
        self.manifest.session_start_monotonic_ns = t0;
        start_gate.release(t0)?;
        write_timing_anchors(&self.layout, &self.manifest.tracks, 0)?;
        self.state = super::SessionState::Recording;
        self.checkpoint()
    }

    pub fn cancel(mut self) -> Result<(), CaptureError> {
        if !self.state.can_cancel() {
            return Err(invalid_transition(self.state, "Cancelled"));
        }
        if let Some(gate) = self.prepared_start_gate.take() {
            gate.cancel();
        }
        let _ = self.active.stop(&mut self.manifest.tracks, 0);
        self.state = super::SessionState::Failed;
        self.remove_artifacts()
    }

    pub fn discard(mut self) -> Result<(), CaptureError> {
        if self.state == super::SessionState::Recording {
            let _ = self.close_segment(self.session_ns());
        } else if self.active.has_screen() {
            if let Some(gate) = self.prepared_start_gate.take() {
                gate.cancel();
            }
            let now = self.session_ns();
            let _ = self.active.stop(&mut self.manifest.tracks, now);
        }
        self.state = super::SessionState::Failed;
        self.remove_artifacts()
    }

    fn remove_artifacts(self) -> Result<(), CaptureError> {
        if self.layout.root().exists() {
            std::fs::remove_dir_all(self.layout.root())
                .map_err(|error| CaptureError::storage(self.layout.root(), error))?;
        }
        let manifest_path = self.project_layout.project_manifest();
        if self.project_existed {
            let mut project: crate::model::ProjectManifest = serde_json::from_slice(
                &std::fs::read(&manifest_path)
                    .map_err(|error| CaptureError::storage(&manifest_path, error))?,
            )?;
            project
                .sessions
                .retain(|entry| entry.session_id != self.session_id);
            write_atomic(&manifest_path, &serde_json::to_vec_pretty(&project)?)?;
        } else if self.project_layout.project_dir().exists() {
            std::fs::remove_dir_all(self.project_layout.project_dir()).map_err(|error| {
                CaptureError::storage(&self.project_layout.project_dir(), error)
            })?;
        }
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), CaptureError> {
        if self.state != super::SessionState::Recording {
            return Err(invalid_transition(self.state, "Paused"));
        }
        let now = self.session_ns();
        #[cfg(target_os = "linux")]
        if matches!(
            self.request.screen,
            Some(crate::model::ScreenSelection::Portal { .. })
        ) {
            if let Err(error) = self.active.pause_portal(&mut self.manifest.tracks, now) {
                self.state = super::SessionState::Failed;
                return Err(error);
            }
        } else {
            self.close_segment(now)?;
        }
        #[cfg(not(target_os = "linux"))]
        self.close_segment(now)?;
        self.state = super::SessionState::Paused;
        self.checkpoint()
    }

    pub fn resume(&mut self) -> Result<(), CaptureError> {
        if self.state != super::SessionState::Paused {
            return Err(invalid_transition(self.state, "Recording"));
        }
        let now = self.session_ns();
        let start_gate = Arc::new(super::StartGate::new());
        #[cfg(target_os = "linux")]
        if matches!(
            self.request.screen,
            Some(crate::model::ScreenSelection::Portal { .. })
        ) {
            self.generation = self.generation.saturating_add(1);
            let result = self.active.resume_portal(OpenContext {
                request: &self.request,
                snapshot: &self.snapshot,
                layout: &self.layout,
                generation: self.generation,
                start_ns: now,
                tracks: &mut self.manifest.tracks,
                start_gate: &start_gate,
            });
            if let Err(error) = result {
                start_gate.cancel();
                self.state = super::SessionState::Failed;
                return Err(error);
            }
        } else {
            self.open_segment(now, &start_gate)?;
        }
        #[cfg(not(target_os = "linux"))]
        self.open_segment(now, &start_gate)?;
        start_gate.release(self.clock.now_ns())?;
        write_timing_anchors(&self.layout, &self.manifest.tracks, now)?;
        self.state = super::SessionState::Recording;
        self.checkpoint()
    }

    pub fn stop(&mut self) -> Result<PathBuf, CaptureError> {
        if self.state == super::SessionState::Completed {
            return Ok(self.layout.manifest());
        }
        let now = self.session_ns();
        let close_error = if self.state == super::SessionState::Recording
            || (cfg!(target_os = "linux")
                && self.state == super::SessionState::Paused
                && matches!(
                    self.request.screen,
                    Some(crate::model::ScreenSelection::Portal { .. })
                )) {
            self.close_segment(now).err()
        } else {
            None
        };
        self.state = super::SessionState::Finalizing;
        self.manifest.duration_ns = now;
        if let Some(error) = &close_error {
            self.manifest
                .warnings
                .push(format!("track shutdown reported: {error}"));
        }
        let required_screen_failed =
            self.manifest.tracks.iter().any(|track| {
                track.kind == TrackKind::Screen && track.status == TrackStatus::Failed
            });
        for track in &mut self.manifest.tracks {
            if track.status != TrackStatus::Failed {
                track.status = TrackStatus::Completed;
            }
        }
        write_health_snapshot(&self.layout, &self.manifest.tracks, now)?;
        checkpoint_tracks(&self.layout, &self.manifest.tracks)?;
        let path = self.writer.finalize(&mut self.manifest)?;
        let cursor_partial = self
            .layout
            .track_dir(TrackKind::Cursor)
            .join("cursor.partial.jsonl");
        if cursor_partial.exists() {
            std::fs::remove_file(&cursor_partial)
                .map_err(|error| CaptureError::storage(&cursor_partial, error))?;
        }
        self.state = super::SessionState::Completed;
        if let Some(error) = close_error
            && (required_screen_failed
                || self.request.failure_policy == crate::model::FailurePolicy::FailFast)
        {
            return Err(error);
        }
        Ok(path)
    }

    fn session_ns(&self) -> u64 {
        self.clock
            .now_ns()
            .saturating_sub(self.manifest.session_start_monotonic_ns)
    }

    fn open_segment(
        &mut self,
        start_ns: u64,
        start_gate: &Arc<super::StartGate>,
    ) -> Result<(), CaptureError> {
        self.generation = self.generation.saturating_add(1);
        let generation = self.generation;
        let mut opened = ActiveRecordings::default();
        let result = opened.open(OpenContext {
            request: &self.request,
            snapshot: &self.snapshot,
            layout: &self.layout,
            generation,
            start_ns,
            tracks: &mut self.manifest.tracks,
            start_gate,
        });
        if let Err(error) = result {
            start_gate.cancel();
            let _cleanup = opened.stop(&mut self.manifest.tracks, start_ns);
            self.state = super::SessionState::Failed;
            return Err(error);
        }
        self.active = opened;
        Ok(())
    }

    fn close_segment(&mut self, end_ns: u64) -> Result<(), CaptureError> {
        self.active.stop(&mut self.manifest.tracks, end_ns)
    }

    fn checkpoint(&self) -> Result<(), CaptureError> {
        checkpoint_tracks(&self.layout, &self.manifest.tracks)?;
        self.writer.checkpoint(&self.manifest)
    }
}

#[cfg(test)]
#[path = "recording_tests.rs"]
mod tests;
