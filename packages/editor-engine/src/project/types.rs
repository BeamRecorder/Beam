//! Persisted document types. Source files are immutable after import.
use crate::{
    timeline::types::{Clip, Track},
    video::zoom::types::{CursorPoint, Zoom},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const DOCUMENT_VERSION: u32 = 1;
pub const DOCUMENT_FILE: &str = "editor.beam.json";
pub const HISTORY_LIMIT: usize = 50;
pub const MAX_DURATION_MS: u64 = 6 * 60 * 60 * 1000;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Canvas {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub background: u32,
}
impl Default for Canvas {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            fps: 30,
            background: 0xff161616,
        }
    }
}
impl Canvas {
    /// Fits high-resolution recordings into the supported render canvas, preserving aspect.
    pub fn from_source(width: u32, height: u32) -> Self {
        let factor = (4096. / width.max(1) as f64)
            .min(4096. / height.max(1) as f64)
            .min(1.);
        Self {
            width: (width as f64 * factor).round().max(16.) as u32,
            height: (height as f64 * factor).round().max(16.) as u32,
            ..Self::default()
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaAsset {
    pub id: Uuid,
    pub name: String,
    pub path: String,
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub has_video: bool,
    pub has_audio: bool,
    #[serde(default)]
    pub is_image: bool,
    pub cursor: Vec<CursorPoint>,
    pub zooms: Vec<Zoom>,
    pub recording: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub canvas: Canvas,
    pub assets: Vec<MediaAsset>,
    pub tracks: Vec<Track>,
    pub clips: Vec<Clip>,
    pub warnings: Vec<String>,
}
impl Project {
    /// Creates an empty document with video and audio lanes.
    pub fn new(name: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            canvas: Canvas::default(),
            assets: vec![],
            tracks: vec![
                Track::new("Video".into(), crate::TrackKind::Video),
                Track::new("Audio".into(), crate::TrackKind::Audio),
            ],
            clips: vec![],
            warnings: vec![],
        }
    }
    /// Returns the end of the last clip, using half-open clip intervals.
    pub fn duration_ms(&self) -> u64 {
        self.clips
            .iter()
            .map(|c| c.start_ms.saturating_add(c.duration_ms))
            .max()
            .unwrap_or(0)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    pub schema_version: u32,
    pub revision: u64,
    pub project: Project,
    pub undo: Vec<EditState>,
    pub redo: Vec<EditState>,
    #[serde(default)]
    pub active_sequence: Uuid,
    #[serde(default)]
    pub sequences: Vec<crate::timeline::sequence_types::Sequence>,
}
/// History stores edit decisions, never copies of media or cursor telemetry.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditState {
    pub name: String,
    pub canvas: Canvas,
    pub tracks: Vec<Track>,
    pub clips: Vec<Clip>,
}
impl EditState {
    pub fn capture(project: &Project) -> Self {
        Self {
            name: project.name.clone(),
            canvas: project.canvas.clone(),
            tracks: project.tracks.clone(),
            clips: project.clips.clone(),
        }
    }
    pub fn restore(self, project: &mut Project) {
        project.name = self.name;
        project.canvas = self.canvas;
        project.tracks = self.tracks;
        project.clips = self.clips;
    }
}
impl Document {
    /// Wraps a project in a versioned, recoverable edit history.
    pub fn new(project: Project) -> Self {
        let mut document = Self {
            schema_version: DOCUMENT_VERSION,
            revision: 0,
            project,
            undo: vec![],
            redo: vec![],
            active_sequence: Uuid::nil(),
            sequences: vec![],
        };
        crate::timeline::sequences::synchronize(&mut document);
        document
    }
}
