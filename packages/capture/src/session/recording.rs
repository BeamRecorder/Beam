use std::{path::PathBuf, sync::Arc};

use crate::{
    CaptureError,
    catalog::{CatalogSnapshot, validate_request},
    clock::{MonotonicClock, SessionClock},
    model::{
        CaptureRequest, PlatformMetadata, SCHEMA_VERSION, SessionId, SessionManifest, TrackKind,
        TrackStatus,
    },
    storage::{ManifestWriter, ProjectLayout, create_or_update_project},
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
        create_or_update_project(
            &request.recording.output_root,
            request.project_id,
            session_id,
            &created_at_utc,
        )?;
        let project_layout = ProjectLayout::new(&request.recording.output_root, request.project_id);
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
        Ok(Self {
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
        })
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

    pub fn start(&mut self) -> Result<(), CaptureError> {
        if self.state != super::SessionState::Armed {
            return Err(invalid_transition(self.state, "Recording"));
        }
        let start_gate = Arc::new(super::StartGate::new());
        self.open_segment(0, &start_gate)?;
        let t0 = self.clock.now_ns();
        self.manifest.session_start_monotonic_ns = t0;
        start_gate.release(t0)?;
        write_timing_anchors(&self.layout, &self.manifest.tracks, 0)?;
        self.state = super::SessionState::Recording;
        self.checkpoint()
    }

    pub fn pause(&mut self) -> Result<(), CaptureError> {
        if self.state != super::SessionState::Recording {
            return Err(invalid_transition(self.state, "Paused"));
        }
        let now = self.session_ns();
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
        let close_error = if self.state == super::SessionState::Recording {
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
            && self.request.failure_policy == crate::model::FailurePolicy::FailFast
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
