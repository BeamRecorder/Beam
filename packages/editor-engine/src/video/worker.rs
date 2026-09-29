//! Owns GES on one thread and commits disk, timeline, and document state together.
use super::{
    pipeline::media,
    preview::Frames,
    types::{EditorSnapshot, Transport},
};
use crate::export::render::Exporter;
use crate::project::{store::ProjectStore, types::DOCUMENT_FILE};
use crate::{Document, Edit, EditorError, Project, Result};
use gst::prelude::*;
use std::{path::PathBuf, sync::Arc, time::Duration};

pub(super) use super::command_types::Command;
mod assets;
mod presentation;
mod runner;
mod window;
mod window_types;
use presentation::{prepare, transfer};
pub(super) use runner::run;
pub(crate) struct PipelineGuard(pub ges::Pipeline);
impl Drop for PipelineGuard {
    fn drop(&mut self) {
        if let Err(e) = self.0.set_state(gst::State::Null) {
            eprintln!("Beam editor pipeline cleanup: {e}");
        }
    }
}
struct Worker {
    preload_task: Option<window_types::WindowTask>,
    preview_window: super::plan_types::PreviewWindow,
    store: Option<ProjectStore>,
    document: Option<Document>,
    pipeline: Option<PipelineGuard>,
    frames: Frames,
    pipeline_frames: Frames,
    playing: bool,
    position: u64,
    error: Option<String>,
    recovered: bool,
    exporter: Exporter,
    changes: Arc<super::change_types::Changes>,
}

impl Worker {
    fn source(&self, id: &str) -> Result<super::visuals::types::Source> {
        let id = uuid::Uuid::parse_str(id).map_err(media)?;
        let document = self.document.as_ref().ok_or_else(no_project)?;
        let source = document
            .project
            .assets
            .iter()
            .find(|asset| asset.id == id)
            .ok_or_else(|| media("missing source asset"))?;
        // Source artwork needs no cursor/zoom telemetry, which may span hours.
        let asset = crate::MediaAsset {
            cursor_mode: beam_editor_domain::recording::style_types::CursorMode::Absent,
            cursor: vec![].into(),
            zooms: vec![].into(),
            id: source.id,
            name: source.name.clone(),
            path: source.path.clone(),
            identity: source.identity.clone(),
            duration_ms: source.duration_ms,
            width: source.width,
            height: source.height,
            has_video: source.has_video,
            has_audio: source.has_audio,
            is_image: source.is_image,
            recording: source.recording,
        };
        Ok(super::visuals::types::Source {
            project_id: document.project.id,
            root: self.store.as_ref().ok_or_else(no_project)?.root.clone(),
            asset,
        })
    }
    fn open(&mut self, root: PathBuf, name: Option<String>) -> Result<EditorSnapshot> {
        if self.store.as_ref().is_some_and(|s| s.root == root) && name.is_none() {
            return self.snapshot();
        }
        let store = ProjectStore::lock(&root)?;
        self.cancel_preload();
        let (mut document, recovered) = if let Some(name) = name {
            if root.join(DOCUMENT_FILE).exists() || root.join("project.json").exists() {
                return Err(EditorError::Invalid("project already exists".into()));
            }
            (Document::new(Project::new(name)), false)
        } else if root.join(DOCUMENT_FILE).exists()
            || root.join("editor.beam.previous.json").exists()
        {
            store.read()?
        } else {
            (
                Document::new(crate::project::recording::open(&root)?),
                false,
            )
        };
        crate::project::sources::hydrate(&store.root, &mut document.project)?;
        crate::project::validation::document(&document)?;
        let frames = Frames::default();
        *frames.quality.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .quality
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        *frames.transport.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .transport
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let (pipeline, error) = match prepare(&store, &document.project, Arc::clone(&frames), 0) {
            Ok(pipeline) => (pipeline, None),
            Err(e) => (None, Some(e.to_string())),
        };
        if !recovered {
            document = store.write(&document)?;
        }
        self.playing = false;
        self.pipeline = pipeline;
        self.store = Some(store);
        self.document = Some(document);
        self.position = 0;
        self.error = error;
        self.recovered = recovered;
        self.frames.clear();
        self.pipeline_frames = frames;
        transfer(&self.frames, &self.pipeline_frames);
        self.pipeline_frames.forward_to(&self.frames);
        self.changes
            .publish(self.document.as_ref().ok_or_else(no_project)?);
        self.snapshot()
    }
    fn snapshot(&mut self) -> Result<EditorSnapshot> {
        let transport = self.transport();
        let document = self.document.as_ref().ok_or_else(no_project)?;
        let mut snapshot = EditorSnapshot {
            active_sequence: document.active_sequence,
            sequences: document
                .sequences
                .iter()
                .map(|s| crate::timeline::sequence_types::SequenceView {
                    id: s.id,
                    name: s.name.clone(),
                })
                .collect(),
            project: (&document.project).into(),
            revision: document.revision,
            can_undo: !document.undo.is_empty(),
            can_redo: !document.redo.is_empty(),
            can_project_undo: !document.project_undo.is_empty(),
            can_project_redo: !document.project_redo.is_empty(),
            recovered: self.recovered,
            transport,
            export_formats: crate::export::profile::available(),
        };
        snapshot
            .project
            .warnings
            .extend(super::recording_effects::warnings(&document.project));
        Ok(snapshot)
    }
    fn transport(&mut self) -> Transport {
        self.messages();
        let duration = self
            .document
            .as_ref()
            .map_or(0, |d| d.project.duration_ms());
        if (self.playing || self.position < duration)
            && let Some(pipeline) = &self.pipeline
        {
            self.position = pipeline
                .0
                .query_position::<gst::ClockTime>()
                .map_or(self.position, |t| t.mseconds())
                .min(duration);
        }
        Transport {
            position_ms: self.position,
            duration_ms: self
                .document
                .as_ref()
                .map_or(0, |d| d.project.duration_ms()),
            playing: self.playing,
            error: self.error.clone(),
        }
    }
    fn play(&mut self, playing: bool) -> Result<Transport> {
        if playing && self.pipeline.is_none() {
            return Err(EditorError::Media(
                self.error
                    .clone()
                    .unwrap_or("add media before playing".into()),
            ));
        }
        if playing {
            self.pipeline_frames.resume();
        }
        if let Some(pipeline) = &self.pipeline {
            pipeline
                .0
                .set_state(if playing {
                    gst::State::Playing
                } else {
                    gst::State::Paused
                })
                .map_err(media)?;
        }
        self.playing = playing;
        Ok(self.transport())
    }
    fn seek(&mut self, time: u64) -> Result<Transport> {
        let duration = self
            .document
            .as_ref()
            .ok_or_else(no_project)?
            .project
            .duration_ms();
        if time > duration {
            return Err(EditorError::Invalid("seek is outside the timeline".into()));
        }
        let time = time.min(duration.saturating_sub(1));
        if self.ensure_window(time)? {
            return Ok(self.transport());
        }
        if let Some(pipeline) = &self.pipeline {
            let canvas = &self
                .document
                .as_ref()
                .ok_or_else(no_project)?
                .project
                .canvas;
            self.pipeline_frames.seek(
                &pipeline.0,
                gst::ClockTime::from_mseconds(time),
                canvas.fps,
                canvas.fps_denominator,
            )?;
            if self.playing {
                self.pipeline_frames.resume();
            } else {
                self.pipeline_frames.wait(Duration::from_secs(10))?;
            }
        }
        self.position = time;
        Ok(self.transport())
    }
    fn edit(&mut self, revision: u64, edit: Edit) -> Result<EditorSnapshot> {
        let document = self.document.as_ref().ok_or_else(no_project)?;
        if document.revision != revision {
            return Err(EditorError::Invalid(
                "the project changed; refresh before editing".into(),
            ));
        }
        let request = beam_editor_domain::commands::single(document, edit);
        let prepared = beam_editor_domain::commands::prepare(document, &request)?;
        self.commit(prepared.document)
    }
    fn transaction(
        &mut self,
        request: beam_editor_domain::commands::types::Transaction,
    ) -> Result<beam_editor_domain::commands::types::Receipt> {
        let prepared = beam_editor_domain::commands::prepare(
            self.document.as_ref().ok_or_else(no_project)?,
            &request,
        )?;
        if !prepared.replay {
            self.commit(prepared.document)?;
        }
        Ok(prepared.receipt)
    }
    fn import(&mut self, paths: Vec<PathBuf>) -> Result<EditorSnapshot> {
        let document = self.document.as_ref().ok_or_else(no_project)?;
        let context = beam_editor_domain::protocol::RenderContext {
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            expected_revision: document.revision,
            idempotency_key: uuid::Uuid::new_v4().to_string(),
        };
        self.import_publication(context, paths)?;
        self.snapshot()
    }
    fn commit(&mut self, next: Document) -> Result<EditorSnapshot> {
        self.cancel_preload();
        if let (Some(pipeline), Some(previous), Some(store)) =
            (&self.pipeline, &self.document, &self.store)
            && previous.revision != next.revision
            && previous.active_sequence == next.active_sequence
            && let Some(update) =
                super::pipeline::prepare_update(&pipeline.0, &previous.project, &next.project)?
        {
            let next = store.write(&next)?;
            update.apply();
            self.document = Some(next);
            self.error = None;
            self.recovered = false;
            if !self.playing
                && let Err(error) = self.seek(self.position)
            {
                self.error = Some(error.to_string());
            }
            self.changes
                .publish(self.document.as_ref().ok_or_else(no_project)?);
            return self.snapshot();
        }
        self.transport();
        let switched = self
            .document
            .as_ref()
            .is_some_and(|doc| doc.active_sequence != next.active_sequence);
        let position = if switched {
            0
        } else {
            self.position
                .min(next.project.duration_ms().saturating_sub(1))
        };
        let store = self.store.as_ref().ok_or_else(no_project)?;
        let pending = Frames::default();
        *pending.quality.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .quality
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        *pending.transport.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .transport
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let pipeline = prepare(store, &next.project, Arc::clone(&pending), position)?;
        let next = store.write(&next)?;
        self.playing = false;
        self.pipeline = pipeline;
        self.document = Some(next);
        self.position = position;
        self.error = None;
        self.recovered = false;
        self.pipeline_frames = pending;
        transfer(&self.frames, &self.pipeline_frames);
        self.pipeline_frames.forward_to(&self.frames);
        self.changes
            .publish(self.document.as_ref().ok_or_else(no_project)?);
        self.snapshot()
    }
    fn messages(&mut self) {
        transfer(&self.frames, &self.pipeline_frames);
        let Some(pipeline) = &self.pipeline else {
            return;
        };
        let Some(bus) = pipeline.0.bus() else {
            return;
        };
        for message in bus.iter() {
            match message.view() {
                gst::MessageView::Eos(..) => {
                    self.playing = false;
                    self.position = self
                        .document
                        .as_ref()
                        .map_or(0, |d| d.project.duration_ms());
                    let _ = pipeline.0.set_state(gst::State::Paused);
                }
                gst::MessageView::Error(error) => {
                    self.error = Some(error.error().to_string());
                    self.playing = false;
                    let _ = pipeline.0.set_state(gst::State::Paused);
                }
                _ => {}
            }
        }
    }
}
fn no_project() -> EditorError {
    EditorError::Invalid("open or create a project first".into())
}
