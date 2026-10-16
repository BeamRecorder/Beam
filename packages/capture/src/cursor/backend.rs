use serde::{Deserialize, Serialize};

pub const CURSOR_TELEMETRY_VERSION: u8 = 2;
pub const CURSOR_SAMPLE_INTERVAL_NS: u64 = 33_333_333;
pub const MAX_CURSOR_TELEMETRY_SAMPLES: usize = 216_000;

/// Keeps the native polling loop drift-free while still emitting at a bounded cadence.
pub fn move_sample_due(next_sample_ns: &mut u64, session_ns: u64) -> bool {
    if session_ns < *next_sample_ns {
        return false;
    }
    let elapsed = session_ns.saturating_sub(*next_sample_ns);
    let steps = elapsed / CURSOR_SAMPLE_INTERVAL_NS + 1;
    *next_sample_ns =
        next_sample_ns.saturating_add(steps.saturating_mul(CURSOR_SAMPLE_INTERVAL_NS));
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorTelemetryPoint {
    pub time_ms: u64,
    pub cx: f64,
    pub cy: f64,
    #[serde(default = "visible_by_default")]
    pub visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interaction_type: Option<CursorInteractionType>,
}

const fn visible_by_default() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CursorInteractionType {
    Move,
    Click,
    DoubleClick,
    RightClick,
    MiddleClick,
    Mouseup,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CursorTelemetrySidecar {
    pub version: u8,
    pub samples: Vec<CursorTelemetryPoint>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hotspot {
    pub x: u32,
    pub y: u32,
}

/// Portable cursor vocabulary. Values map directly to the editor's SVG assets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CursorKind {
    Default,
    Textcursor,
    Handpointing,
    Busy,
    Help,
    Cross,
    Move,
    Notallowed,
    Resizenorthsouth,
    Resizewesteast,
    Resizenortheastsouthwest,
    Resizenorthwestsoutheast,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorShapeCatalogEntry {
    pub cursor_kind: CursorKind,
    pub native_cursor_id: String,
    pub hotspot: Hotspot,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "event",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum CursorEvent {
    Metadata {
        session_ns: u64,
        display_scale_factor: f64,
    },
    Move {
        session_ns: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor_id: Option<String>,
        pixel_x: i32,
        pixel_y: i32,
        normalized_x: f64,
        normalized_y: f64,
        visible: bool,
    },
    Shape {
        session_ns: u64,
        cursor_id: String,
        cursor_kind: CursorKind,
        native_cursor_id: String,
        hotspot: Hotspot,
    },
    Button {
        session_ns: u64,
        button: u8,
        pressed: bool,
        normalized_x: f64,
        normalized_y: f64,
    },
    Visibility {
        session_ns: u64,
        visible: bool,
    },
    CropChanged {
        session_ns: u64,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    },
}

#[must_use]
pub fn telemetry_from_events(events: &[CursorEvent]) -> CursorTelemetrySidecar {
    let mut builder = super::telemetry::TelemetryBuilder::default();
    for event in events {
        builder.push(event);
    }
    builder.finish()
}

pub trait CursorBackend: Send {
    fn stop(&mut self) -> Result<(), crate::CaptureError>;
}
