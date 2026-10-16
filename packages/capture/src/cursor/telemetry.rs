use super::{
    CURSOR_TELEMETRY_VERSION, CursorEvent, CursorInteractionType, CursorTelemetryPoint,
    CursorTelemetrySidecar, MAX_CURSOR_TELEMETRY_SAMPLES,
};
use std::collections::VecDeque;

pub(crate) struct TelemetryBuilder {
    samples: VecDeque<CursorTelemetryPoint>,
    last_left_click: Option<(u64, f64, f64)>,
    visible: bool,
}

impl Default for TelemetryBuilder {
    fn default() -> Self {
        Self {
            samples: VecDeque::new(),
            last_left_click: None,
            visible: true,
        }
    }
}

impl TelemetryBuilder {
    pub(crate) fn push(&mut self, event: &CursorEvent) {
        match event {
            CursorEvent::Move {
                session_ns,
                normalized_x,
                normalized_y,
                visible,
                ..
            } => {
                self.visible = *visible;
                self.samples.push_back(CursorTelemetryPoint {
                    time_ms: session_ns / 1_000_000,
                    cx: *normalized_x,
                    cy: *normalized_y,
                    visible: *visible,
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
                    visible: self.visible,
                    interaction_type: Some(interaction_type),
                });
            }
            CursorEvent::Visibility {
                session_ns,
                visible,
            } => {
                self.visible = *visible;
                if let Some(previous) = self.samples.back() {
                    self.samples.push_back(CursorTelemetryPoint {
                        time_ms: session_ns / 1_000_000,
                        cx: previous.cx,
                        cy: previous.cy,
                        visible: *visible,
                        interaction_type: Some(CursorInteractionType::Move),
                    });
                }
            }
            CursorEvent::Metadata { .. }
            | CursorEvent::Shape { .. }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn movement(time_ms: u64, visible: bool) -> CursorEvent {
        CursorEvent::Move {
            session_ns: time_ms * 1_000_000,
            cursor_id: None,
            pixel_x: 200,
            pixel_y: 300,
            normalized_x: 0.2,
            normalized_y: 0.3,
            visible,
        }
    }
    fn button(time_ms: u64, number: u8, pressed: bool) -> CursorEvent {
        CursorEvent::Button {
            session_ns: time_ms * 1_000_000,
            button: number,
            pressed,
            normalized_x: 0.2,
            normalized_y: 0.3,
        }
    }

    #[test]
    fn legacy_sidecar_defaults_to_visible_and_new_visibility_round_trips()
    -> Result<(), serde_json::Error> {
        let old: CursorTelemetryPoint = serde_json::from_str(r#"{"timeMs":10,"cx":0.2,"cy":0.3}"#)?;
        assert!(old.visible);
        let hidden = CursorTelemetryPoint {
            visible: false,
            ..old
        };
        let serialized = serde_json::to_string(&hidden)?;
        assert_eq!(
            serde_json::from_str::<CursorTelemetryPoint>(&serialized)?,
            hidden
        );
        Ok(())
    }

    #[test]
    fn visibility_only_events_preserve_position_and_hidden_clicks() {
        let mut builder = TelemetryBuilder::default();
        builder.push(&movement(10, true));
        builder.push(&CursorEvent::Visibility {
            session_ns: 20_000_000,
            visible: false,
        });
        builder.push(&button(30, 1, true));
        builder.push(&button(40, 1, false));
        builder.push(&CursorEvent::Visibility {
            session_ns: 50_000_000,
            visible: true,
        });
        let data = builder.finish();
        assert_eq!(
            data.samples.iter().map(|p| p.visible).collect::<Vec<_>>(),
            [true, false, false, false, true]
        );
        assert!(data.samples.iter().all(|p| p.cx == 0.2 && p.cy == 0.3));
        assert_eq!(
            data.samples[2].interaction_type,
            Some(CursorInteractionType::Click)
        );
        assert_eq!(
            data.samples[3].interaction_type,
            Some(CursorInteractionType::Mouseup)
        );
    }

    #[test]
    fn visibility_before_the_first_position_still_controls_button_metadata() {
        let mut builder = TelemetryBuilder::default();
        builder.push(&CursorEvent::Visibility {
            session_ns: 0,
            visible: false,
        });
        builder.push(&button(10, 2, true));
        builder.push(&movement(20, true));
        builder.push(&button(30, 3, true));
        builder.push(&button(40, 9, true));
        let data = builder.finish();
        assert_eq!(data.samples.len(), 3);
        assert!(!data.samples[0].visible);
        assert_eq!(
            data.samples[0].interaction_type,
            Some(CursorInteractionType::RightClick)
        );
        assert!(data.samples[2].visible);
        assert_eq!(
            data.samples[2].interaction_type,
            Some(CursorInteractionType::MiddleClick)
        );
    }

    #[test]
    fn alternating_visibility_and_moves_remain_bounded_during_long_sessions() {
        let mut builder = TelemetryBuilder::default();
        for index in 0..MAX_CURSOR_TELEMETRY_SAMPLES * 3 {
            builder.push(&movement(index as u64, index % 2 == 0));
        }
        let data = builder.finish();
        assert_eq!(data.samples.len(), MAX_CURSOR_TELEMETRY_SAMPLES);
        assert_eq!(
            data.samples[0].time_ms,
            (MAX_CURSOR_TELEMETRY_SAMPLES * 2) as u64
        );
        assert_eq!(
            data.samples[MAX_CURSOR_TELEMETRY_SAMPLES - 1].time_ms,
            (MAX_CURSOR_TELEMETRY_SAMPLES * 3 - 1) as u64
        );
    }
}
