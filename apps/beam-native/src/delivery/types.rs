//! Typed callback payloads matching the ARGUI host event contract.

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub(super) struct NodeIdentity {
    pub slot: u32,
    pub generation: u32,
}
#[derive(Serialize)]
pub(super) struct CallbackEvent {
    pub node: NodeIdentity,
    pub callback: u32,
    pub payload: Value,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PointerGeometry {
    pub x: f32,
    pub y: f32,
    pub local_x: f32,
    pub local_y: f32,
    pub width: f32,
    pub height: f32,
}
#[derive(Serialize)]
pub(super) struct EventPayload {
    pub kind: &'static str,
    #[serde(flatten)]
    pub data: EventData,
}
#[derive(Serialize)]
pub(super) struct Measurement {
    pub index: usize,
    pub extent: f32,
}
#[derive(Serialize)]
#[serde(untagged)]
pub(super) enum SemanticValue {
    Text(String),
    Number(f64),
}

#[derive(Serialize)]
#[serde(untagged, rename_all_fields = "camelCase")]
pub(super) enum EventData {
    Resize {
        value: f32,
    },
    Empty {},
    Text {
        text: String,
    },
    Key {
        key: String,
        state: &'static str,
        text: Option<String>,
        shift: bool,
        control: bool,
        alt: bool,
        #[serde(rename = "super")]
        super_key: bool,
        repeat: bool,
    },
    Edit {
        start: usize,
        end: usize,
        text: String,
    },
    Scroll {
        offset_x: f32,
        offset_y: f32,
    },
    Wheel {
        delta_x: f32,
        delta_y: f32,
        delta_mode: &'static str,
    },
    Pan {
        delta_x: f32,
        delta_y: f32,
        total_x: f32,
        total_y: f32,
        velocity_x: f32,
        velocity_y: f32,
        phase: &'static str,
    },
    Measure {
        items: Vec<Measurement>,
        corrected_offset: f32,
        viewport_extent: f32,
    },
    Window {
        start: usize,
        end: usize,
        offset: f32,
        viewport_extent: f32,
    },
    Semantic {
        action: &'static str,
        value: Option<SemanticValue>,
    },
}
