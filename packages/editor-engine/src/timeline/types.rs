//! Typed edit intents and persistent timeline lanes.
use super::title_types::Title;
use crate::project::types::Canvas;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Video,
    Audio,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Track {
    pub id: Uuid,
    pub name: String,
    pub kind: TrackKind,
    pub muted: bool,
    pub hidden: bool,
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
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clip {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub track_id: Uuid,
    pub start_ms: u64,
    pub source_in_ms: u64,
    pub duration_ms: u64,
    pub effects: Effects,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<Title>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
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
    Insert {
        asset_id: Uuid,
        track_id: Uuid,
        start_ms: u64,
    },
    InsertTitle {
        title: Title,
        start_ms: u64,
    },
    Title {
        id: Uuid,
        title: Title,
    },
    Move {
        id: Uuid,
        track_id: Uuid,
        start_ms: u64,
    },
    Trim {
        id: Uuid,
        source_in_ms: u64,
        duration_ms: u64,
        start_ms: u64,
    },
    Split {
        id: Uuid,
        time_ms: u64,
    },
    Remove {
        id: Uuid,
    },
    Effects {
        id: Uuid,
        effects: Effects,
    },
    Undo {},
    Redo {},
}
