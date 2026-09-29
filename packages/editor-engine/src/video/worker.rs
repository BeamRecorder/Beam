//! Owns GES on one thread and commits disk, timeline, and document state together.
use super::{
    pipeline::media,
    preview::Frames,
    types::{EditorSnapshot, Transport},
};
use crate::export::render::Exporter;
use crate::project::{store::ProjectStore, types::DOCUMENT_FILE};
use crate::{Document, Edit, EditorError, Project, Result, TrackKind};
use ges::prelude::GESPipelineExt;
use gst::prelude::*;
use std::{path::PathBuf, sync::Arc, time::Duration};

pub(super) use super::command_types::Command;
mod runner;
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
            cursor: vec![],
            zooms: vec![],
            id: source.id,
            name: source.name.clone(),
            path: source.path.clone(),
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
        let (document, recovered) = if let Some(name) = name {
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
        crate::project::validation::document(&document)?;
        self.play(false)?;
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
            store.write(&document)?;
        }
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
        self.snapshot()
    }
    fn snapshot(&mut self) -> Result<EditorSnapshot> {
        let transport = self.transport();
        let document = self.document.as_ref().ok_or_else(no_project)?;
        Ok(EditorSnapshot {
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
            recovered: self.recovered,
            transport,
            export_formats: crate::export::profile::available(),
        })
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
        if let Some(pipeline) = &self.pipeline {
            if !self.playing {
                self.pipeline_frames.expect_position(
                    time,
                    self.document
                        .as_ref()
                        .ok_or_else(no_project)?
                        .project
                        .canvas
                        .fps,
                );
                self.frames.clear();
            }
            pipeline
                .0
                .seek_simple(
                    gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                    gst::ClockTime::from_mseconds(time),
                )
                .map_err(media)?;
            if !self.playing {
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
        let next = crate::timeline::history::edited(document, &edit)?;
        self.commit(next)
    }
    fn import(&mut self, paths: Vec<PathBuf>) -> Result<EditorSnapshot> {
        if paths.is_empty() || paths.len() > 32 {
            return Err(EditorError::Invalid("select 1–32 media files".into()));
        }
        let store = self.store.as_ref().ok_or_else(no_project)?;
        let document = self.document.as_ref().ok_or_else(no_project)?;
        let mut project = document.project.clone();
        for path in paths {
            let asset = super::probe::import(&store.root, &path)?;
            let kind = if asset.has_video {
                TrackKind::Video
            } else {
                TrackKind::Audio
            };
            let track = project
                .tracks
                .iter()
                .find(|t| t.kind == kind)
                .ok_or_else(|| {
                    EditorError::Invalid("add a compatible lane before importing".into())
                })?
                .id;
            let start = project
                .clips
                .iter()
                .filter(|c| c.track_id == track)
                .map(|c| c.start_ms + c.duration_ms)
                .max()
                .unwrap_or(0);
            if project.assets.is_empty() && asset.has_video {
                project.canvas = crate::Canvas::from_source(asset.width, asset.height);
            }
            project.assets.push(asset.clone());
            project = crate::timeline::edit::apply(
                &project,
                &Edit::Insert {
                    asset_id: asset.id,
                    track_id: track,
                    start_ms: start,
                },
            )?;
        }
        self.commit(crate::timeline::history::replaced(document, project)?)
    }
    fn commit(&mut self, next: Document) -> Result<EditorSnapshot> {
        self.play(false)?;
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
        store.write(&next)?;
        self.pipeline = pipeline;
        self.document = Some(next);
        self.position = position;
        self.error = None;
        self.recovered = false;
        self.frames.clear();
        self.pipeline_frames = pending;
        transfer(&self.frames, &self.pipeline_frames);
        self.pipeline_frames.forward_to(&self.frames);
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
fn prepare(
    store: &ProjectStore,
    project: &Project,
    frames: Frames,
    position: u64,
) -> Result<Option<PipelineGuard>> {
    if project.duration_ms() == 0 {
        return Ok(None);
    }
    let pipeline = super::pipeline::build(&store.root, project)?;
    let guard = PipelineGuard(pipeline.clone());
    frames.expect_position(0, project.canvas.fps);
    super::preview::attach(&pipeline, &project.canvas, Arc::clone(&frames))?;
    if !super::pipeline::has_audio(project) {
        pipeline
            .set_mode(ges::PipelineFlags::VIDEO_PREVIEW)
            .map_err(media)?;
    }
    pipeline
        .set_state(gst::State::Paused)
        .map_err(|error| preview_error(&pipeline, error))?;
    let (result, _, _) = pipeline.state(gst::ClockTime::from_seconds(15));
    result.map_err(|error| preview_error(&pipeline, error))?;
    frames.wait(Duration::from_secs(10))?;
    if position > 0 {
        frames.expect_position(position, project.canvas.fps);
        pipeline
            .seek_simple(
                gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                gst::ClockTime::from_mseconds(position),
            )
            .map_err(media)?;
        frames.wait(Duration::from_secs(10))?;
    }
    Ok(Some(guard))
}
fn preview_error(pipeline: &ges::Pipeline, error: impl std::fmt::Display) -> EditorError {
    if let Some(bus) = pipeline.bus() {
        for message in bus.iter() {
            if let gst::MessageView::Error(failure) = message.view() {
                return media(format!(
                    "{} ({})",
                    failure.error(),
                    failure.debug().unwrap_or_default()
                ));
            }
        }
    }
    media(error)
}
fn transfer(output: &Frames, pending: &Frames) {
    if let Some(frame) = pending.take() {
        output.publish(frame);
    }
}
