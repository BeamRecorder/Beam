use super::{
    CURSOR_TELEMETRY_VERSION, CursorEvent, CursorInteractionType, CursorTelemetryPoint,
    CursorTelemetrySidecar, MAX_CURSOR_TELEMETRY_SAMPLES,
};
use std::collections::VecDeque;

#[derive(Default)]
pub(crate) struct TelemetryBuilder {
    samples: VecDeque<CursorTelemetryPoint>,
    last_left_click: Option<(u64, f64, f64)>,
}

impl TelemetryBuilder {
    pub(crate) fn push(&mut self, event: &CursorEvent) {
        match event {
            CursorEvent::Move {
                session_ns,
                normalized_x,
                normalized_y,
                ..
            } => {
                self.samples.push_back(CursorTelemetryPoint {
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
                normalized_x,
                normalized_y,
            } => {
                let position = (*normalized_x, *normalized_y);
                let time_ms = session_ns / 1_000_000;
                let interaction_type = if *pressed {
                    match button {
                        1 => {
                            let double_click =
                                self.last_left_click.is_some_and(|(previous_time, x, y)| {
                                    time_ms.saturating_sub(previous_time) <= 350
                                        && (x - position.0).hypot(y - position.1) <= 0.04
                                });
                            self.last_left_click = Some((time_ms, position.0, position.1));
                            if double_click {
                                CursorInteractionType::DoubleClick
                            } else {
                                CursorInteractionType::Click
                            }
                        }
                        2 => CursorInteractionType::RightClick,
                        3 => CursorInteractionType::MiddleClick,
                        _ => return,
                    }
                } else {
                    CursorInteractionType::Mouseup
                };
                self.samples.push_back(CursorTelemetryPoint {
                    time_ms,
                    cx: position.0,
                    cy: position.1,
                    interaction_type: Some(interaction_type),
                });
            }
            CursorEvent::Metadata { .. }
            | CursorEvent::Shape { .. }
            | CursorEvent::Visibility { .. }
            | CursorEvent::CropChanged { .. } => {}
        }
        if self.samples.len() > MAX_CURSOR_TELEMETRY_SAMPLES {
            self.samples.pop_front();
        }
    }
    pub(crate) fn finish(self) -> CursorTelemetrySidecar {
        CursorTelemetrySidecar {
            version: CURSOR_TELEMETRY_VERSION,
            samples: self.samples.into(),
        }
    }
}
