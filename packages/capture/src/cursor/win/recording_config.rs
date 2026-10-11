use crate::{screen::ScreenCaptureMetrics, session::StartGate};
use std::sync::Arc;

pub struct WindowsCursorRecordingConfig {
    pub capture_clicks: bool,
    pub capture_shortcuts: bool,
    pub capture_shape: bool,
    pub segment_start_ns: u64,
    pub start_gate: Arc<StartGate>,
    pub screen_metrics: Arc<ScreenCaptureMetrics>,
}
