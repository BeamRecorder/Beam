use serde::{Deserialize, Serialize};

pub const CURSOR_TELEMETRY_VERSION: u8 = 2;
pub const CURSOR_SAMPLE_INTERVAL_NS: u64 = 33_333_333;
pub const MAX_CURSOR_TELEMETRY_SAMPLES: usize = 108_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorTelemetryPoint {
    pub time_ms: u64,
    pub cx: f64,
    pub cy: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interaction_type: Option<CursorInteractionType>,
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
    Move {
        session_ns: u64,
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
    let mut samples = Vec::new();
    let mut last_position = (0.5, 0.5);
    let mut last_left_click: Option<(u64, f64, f64)> = None;
    for event in events {
        match event {
            CursorEvent::Move {
                session_ns,
                normalized_x,
                normalized_y,
                ..
            } => {
                last_position = (*normalized_x, *normalized_y);
                samples.push(CursorTelemetryPoint {
                    time_ms: session_ns / 1_000_000,
                    cx: *normalized_x,
                    cy: *normalized_y,
                    interaction_type: Some(CursorInteractionType::Move),
                });
            }
            CursorEvent::Button {
                session_ns,
                button,
                pressed,
            } => {
                let time_ms = session_ns / 1_000_000;
                let interaction_type = if *pressed {
                    match button {
                        1 => {
                            let double_click =
                                last_left_click.is_some_and(|(previous_time, x, y)| {
                                    time_ms.saturating_sub(previous_time) <= 350
                                        && (x - last_position.0).hypot(y - last_position.1) <= 0.04
                                });
                            last_left_click = Some((time_ms, last_position.0, last_position.1));
                            if double_click {
                                CursorInteractionType::DoubleClick
                            } else {
                                CursorInteractionType::Click
                            }
                        }
                        2 => CursorInteractionType::RightClick,
                        3 => CursorInteractionType::MiddleClick,
                        _ => continue,
                    }
                } else {
                    CursorInteractionType::Mouseup
                };
                samples.push(CursorTelemetryPoint {
                    time_ms,
                    cx: last_position.0,
                    cy: last_position.1,
                    interaction_type: Some(interaction_type),
                });
            }
            CursorEvent::Shape { .. }
            | CursorEvent::Visibility { .. }
            | CursorEvent::CropChanged { .. } => {}
        }
    }
    if samples.len() > MAX_CURSOR_TELEMETRY_SAMPLES {
        samples.drain(..samples.len() - MAX_CURSOR_TELEMETRY_SAMPLES);
    }
    CursorTelemetrySidecar {
        version: CURSOR_TELEMETRY_VERSION,
        samples,
    }
}

pub trait CursorBackend: Send {
    fn stop(&mut self) -> Result<(), crate::CaptureError>;
}
