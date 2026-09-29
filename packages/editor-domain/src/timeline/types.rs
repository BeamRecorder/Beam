//! Typed edit intents and persistent timeline lanes.
use super::title_types::Title;
use crate::project::types::Canvas;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Video,
    Audio,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Track {
    pub id: Uuid,
    pub name: String,
    pub kind: TrackKind,
    pub muted: bool,
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub instances: Vec<crate::effects::Instance>,
}
impl Track {
    /// Creates a lane with independent visibility and audio controls.
    pub fn new(name: String, kind: TrackKind) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            kind,
            muted: false,
            hidden: false,
            instances: vec![],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Effects {
    pub opacity: f64,
    pub volume: f64,
    pub brightness: f64,
    pub saturation: f64,
    pub scale: f64,
    pub x: f64,
    pub y: f64,
    pub auto_zoom: bool,
    #[serde(default)]
    pub fade_in_ms: u64,
    #[serde(default)]
    pub fade_out_ms: u64,
}
impl Default for Effects {
    fn default() -> Self {
        Self {
            opacity: 1.,
            volume: 1.,
            brightness: 0.,
            saturation: 1.,
            scale: 1.,
            x: 0.5,
            y: 0.5,
            auto_zoom: true,
            fade_in_ms: 0,
            fade_out_ms: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clip {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub track_id: Uuid,
    pub start_ms: u64,
    pub source_in_ms: u64,
    pub duration_ms: u64,
    pub effects: Effects,
    #[serde(default)]
    pub cursor_style: Option<crate::recording::style_types::CursorStyleOverride>,
    #[serde(default)]
    pub instances: Vec<crate::effects::Instance>,
    #[serde(default)]
    pub rate: crate::timing::Rate,
    #[serde(default)]
    pub animation_offset_ms: i64,
    #[serde(default)]
    pub generator: Option<crate::effects::Instance>,
    #[serde(default)]
    pub link_group: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<Title>,
}

#[derive(Clone, Debug, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Edit {
    AddSequence {
        name: String,
    },
    DuplicateSequence {
        id: Uuid,
        name: String,
    },
    UndoProject {},
    RedoProject {},
    SelectSequence {
        id: Uuid,
    },
    RenameSequence {
        id: Uuid,
        name: String,
    },
    RemoveSequence {
        id: Uuid,
    },
    Rename {
        name: String,
    },
    Canvas {
        canvas: Canvas,
    },
    AddTrack {
        name: String,
        kind: TrackKind,
    },
    Track {
        id: Uuid,
        muted: bool,
        hidden: bool,
    },
    TrackRename {
        id: Uuid,
        name: String,
    },
    TrackReorder {
        id: Uuid,
        index: usize,
    },
    TrackRemove {
        id: Uuid,
        #[serde(rename = "deleteClips")]
        delete_clips: bool,
    },
    Link {
        ids: Vec<Uuid>,
    },
    Unlink {
        id: Uuid,
    },
    RecordingStyle {
        style: crate::recording::style_types::RecordingStyle,
    },
    CursorStyle {
        id: Uuid,
        style: Option<crate::recording::style_types::CursorStyleOverride>,
    },
    ApplySuggestion {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        index: usize,
    },
    Insert {
        #[serde(rename = "assetId")]
        asset_id: Uuid,
        #[serde(rename = "trackId")]
        track_id: Uuid,
        #[serde(rename = "startMs")]
        start_ms: u64,
    },
    InsertTitle {
        title: Title,
        #[serde(rename = "startMs")]
        start_ms: u64,
    },
    Title {
        id: Uuid,
        title: Title,
    },
    Move {
        id: Uuid,
        #[serde(rename = "trackId")]
        track_id: Uuid,
        #[serde(rename = "startMs")]
        start_ms: u64,
    },
    Trim {
        id: Uuid,
        #[serde(rename = "sourceInMs")]
        source_in_ms: u64,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        #[serde(rename = "startMs")]
        start_ms: u64,
    },
    Split {
        id: Uuid,
        #[serde(rename = "timeMs")]
        time_ms: u64,
    },
    Remove {
        id: Uuid,
    },
    Effects {
        id: Uuid,
        effects: Effects,
    },
    Duplicate {
        id: Uuid,
        #[serde(rename = "trackId")]
        track_id: Uuid,
        #[serde(rename = "startMs")]
        start_ms: u64,
    },
    Retime {
        id: Uuid,
        rate: crate::timing::Rate,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
    EffectAdd {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        instance: crate::effects::Instance,
    },
    EffectUpdate {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        instance: crate::effects::Instance,
    },
    EffectRemove {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        #[serde(rename = "instanceId")]
        instance_id: Uuid,
    },
    EffectReorder {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        #[serde(rename = "instanceId")]
        instance_id: Uuid,
        index: usize,
    },
    TransitionAdd {
        transition: crate::effects::Transition,
    },
    TransitionUpdate {
        transition: crate::effects::Transition,
    },
    TransitionRemove {
        id: Uuid,
    },
    InsertGenerator {
        #[serde(rename = "trackId")]
        track_id: Uuid,
        #[serde(rename = "startMs")]
        start_ms: u64,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        instance: crate::effects::Instance,
    },
    GeneratorUpdate {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        instance: crate::effects::Instance,
    },
    RippleDelete {
        #[serde(rename = "startMs")]
        start_ms: u64,
        #[serde(rename = "endMs")]
        end_ms: u64,
        #[serde(rename = "trackIds")]
        track_ids: Vec<Uuid>,
    },
    Undo {},
    Redo {},
}
