//! Persisted document types. Source files are immutable after import.
use crate::{
    recording::types::{CursorPoint, Zoom},
    timeline::types::{Clip, Track},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const DOCUMENT_VERSION: u32 = 2;
pub const DOCUMENT_FILE: &str = "editor.beam.json";
pub const HISTORY_LIMIT: usize = 50;
pub const MAX_DURATION_MS: u64 = 6 * 60 * 60 * 1000;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Canvas {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    #[serde(default = "one")]
    pub fps_denominator: u32,
    pub background: u32,
}
impl Default for Canvas {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            fps: 30,
            fps_denominator: 1,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaAsset {
    pub id: Uuid,
    pub name: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<SourceIdentity>,
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub has_video: bool,
    pub has_audio: bool,
    #[serde(default)]
    pub is_image: bool,
    pub cursor: std::sync::Arc<Vec<CursorPoint>>,
    pub zooms: std::sync::Arc<Vec<Zoom>>,
    pub recording: bool,
    #[serde(default)]
    pub cursor_mode: crate::recording::style_types::CursorMode,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceIdentity {
    pub sha256: String,
    pub byte_length: u64,
}
impl SourceIdentity {
    pub fn validate(&self) -> crate::Result<()> {
        if self.byte_length == 0
            || self.sha256.len() != 64
            || !self
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(crate::EditorError::Invalid(
                "source identity requires nonempty bytes and a lowercase SHA256 digest".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub canvas: Canvas,
    pub assets: Vec<MediaAsset>,
    pub tracks: crate::collections::PersistentCollection<Track>,
    pub clips: crate::collections::PersistentCollection<Clip>,
    pub warnings: Vec<String>,
    #[serde(default)]
    pub recording_style: crate::recording::style_types::RecordingStyle,
    #[serde(default)]
    pub transitions: Vec<crate::effects::Transition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sequence_instances: Vec<crate::effects::Instance>,
    #[serde(default = "crate::effects::catalog::builtins")]
    pub definitions: Vec<crate::effects::Definition>,
    #[serde(default)]
    pub presets: Vec<crate::effects::preset_types::Preset>,
    #[serde(default)]
    pub extension_packs: Vec<crate::effects::PackProvenance>,
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
            ]
            .into(),
            clips: Default::default(),
            warnings: vec![],
            recording_style: Default::default(),
            transitions: vec![],
            sequence_instances: vec![],
            definitions: crate::effects::catalog::builtins(),
            presets: crate::effects::presets::builtins(),
            extension_packs: vec![],
        }
    }
    /// Returns the end of the last clip, using half-open clip intervals.
    pub fn duration_ms(&self) -> u64 {
        self.clips
            .headers()
            .map(|c| c.start_ms.saturating_add(c.duration_ms))
            .max()
            .unwrap_or(0)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    #[serde(default)]
    pub project_undo: Vec<crate::timeline::project_history_types::ProjectAction>,
    #[serde(default)]
    pub project_redo: Vec<crate::timeline::project_history_types::ProjectAction>,
    pub schema_version: u32,
    pub revision: u64,
    pub project: Project,
    pub undo: Vec<EditState>,
    pub redo: Vec<EditState>,
    #[serde(default)]
    pub active_sequence: Uuid,
    #[serde(default)]
    pub sequences: Vec<crate::timeline::sequence_types::Sequence>,
    #[serde(default)]
    pub receipts: Vec<crate::commands::types::Receipt>,
    #[serde(default)]
    pub import_publications: Vec<crate::commands::import_types::ImportPublication>,
    /// Absence marks a legacy document whose reliable event suffix comes from its receipts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_journal: Option<crate::commands::event_types::EventJournal>,
}
/// History stores edit decisions, never copies of media or cursor telemetry.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditState {
    #[serde(default)]
    pub recording_style: crate::recording::style_types::RecordingStyle,
    pub name: String,
    pub canvas: Canvas,
    pub tracks: crate::collections::PersistentCollection<Track>,
    pub clips: crate::collections::PersistentCollection<Clip>,
    #[serde(default)]
    pub transitions: Vec<crate::effects::Transition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sequence_instances: Vec<crate::effects::Instance>,
}
impl EditState {
    pub fn capture(project: &Project) -> Self {
        Self {
            recording_style: project.recording_style.clone(),
            name: project.name.clone(),
            canvas: project.canvas.clone(),
            tracks: project.tracks.clone(),
            clips: project.clips.clone(),
            transitions: project.transitions.clone(),
            sequence_instances: project.sequence_instances.clone(),
        }
    }
    pub fn restore(self, project: &mut Project) {
        project.recording_style = self.recording_style;
        project.name = self.name;
        project.canvas = self.canvas;
        project.tracks = self.tracks;
        project.clips = self.clips;
        project.transitions = self.transitions;
        project.sequence_instances = self.sequence_instances;
    }
}
impl Document {
    /// Wraps a project in a versioned, recoverable edit history.
    pub fn new(project: Project) -> Self {
        let mut document = Self {
            project_undo: vec![],
            project_redo: vec![],
            schema_version: DOCUMENT_VERSION,
            revision: 0,
            project,
            undo: vec![],
            redo: vec![],
            active_sequence: Uuid::nil(),
            sequences: vec![],
            receipts: vec![],
            import_publications: vec![],
            event_journal: Some(Default::default()),
        };
        crate::timeline::sequences::synchronize(&mut document);
        document
    }
}

fn one() -> u32 {
    1
}
