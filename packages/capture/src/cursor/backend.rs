use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hotspot {
    pub x: u32,
    pub y: u32,
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
        shape_id: String,
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

pub trait CursorBackend: Send {
    fn stop(&mut self) -> Result<(), crate::CaptureError>;
}
