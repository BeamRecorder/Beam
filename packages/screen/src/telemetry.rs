use crate::{CaptureError, ScreenRequest, model::CursorSelection, screen::CursorSampleState};
use beam_media_core::{SessionClock, StartGate};
use std::{path::Path, sync::Arc};

pub struct ScreenTelemetry {
    #[cfg(target_os = "linux")]
    cursor: crate::cursor::CursorOutput,
    #[cfg(target_os = "linux")]
    input: Option<crate::screen::linux::input_timeline::InputTimeline>,
    #[cfg(windows)]
    recording: Option<crate::cursor::win::WindowsCursorRecording>,
    #[cfg(target_os = "macos")]
    recording: Option<crate::cursor::mac::MacCursorRecording>,
}
impl ScreenTelemetry {
    pub fn open(
        directory: &Path,
        request: &ScreenRequest,
        clock: SessionClock,
        gate: Arc<StartGate>,
    ) -> Result<Option<Self>, CaptureError> {
        let CursorSelection::Separate {
            capture_clicks,
            capture_shortcuts,
            capture_shape: _,
        } = request.cursor
        else {
            return Ok(None);
        };
        #[cfg(target_os = "linux")]
        {
            let _ = (clock, gate);
            let input = if capture_clicks || capture_shortcuts {
                Some(
                    crate::screen::linux::input_timeline::InputTimeline::new(
                        directory.to_owned(),
                        capture_clicks,
                        capture_shortcuts,
                    )?
                    .ok_or_else(|| {
                        CaptureError::PermissionDenied(
                            "authorize the Linux input helper to capture interactions".into(),
                        )
                    })?,
                )
            } else {
                None
            };
            Ok(Some(Self {
                cursor: crate::cursor::CursorOutput::new(directory.to_owned()),
                input,
            }))
        }
        #[cfg(any(windows, target_os = "macos"))]
        {
            let crate::model::ScreenSelection::Source { source_id } = &request.selection else {
                return Err(CaptureError::InvalidConfiguration(
                    "native cursor requires a resolved source".into(),
                ));
            };
            #[cfg(windows)]
            let recording = {
                let mut source = crate::cursor::win::source_context(source_id)?;
                if let Some(region) = request.region {
                    source.region = crate::cursor::crop_region(source.region, region)?;
                }
                let CursorSelection::Separate { capture_shape, .. } = request.cursor else {
                    unreachable!()
                };
                crate::cursor::win::WindowsCursorRecording::start(
                    directory,
                    source,
                    capture_clicks,
                    capture_shortcuts,
                    capture_shape,
                    0,
                    gate,
                    clock,
                )?
            };
            #[cfg(target_os = "macos")]
            let recording = {
                let _ = (capture_clicks, capture_shortcuts);
                let mut region = crate::cursor::mac::source_region(source_id)?;
                if let Some(crop) = request.region {
                    region = crate::cursor::crop_region(region, crop)?;
                }
                crate::cursor::mac::MacCursorRecording::start(
                    directory,
                    region,
                    request.cursor,
                    crate::cursor::mac::system_shape_source(),
                    0,
                    gate,
                    clock,
                )?
            };
            Ok(Some(Self {
                recording: Some(recording),
            }))
        }
    }
    pub fn push(&mut self, session_ns: u64, cursor: CursorSampleState) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        {
            self.cursor.push_sample(session_ns, cursor)
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (session_ns, cursor);
            Ok(())
        }
    }
    pub fn poll(&mut self, session_ns: Option<u64>) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        if let Some(input) = &mut self.input {
            use crate::{
                cursor::{buttons::RecordedButton, fusion::CursorInputEvent},
                input::InputEvent,
                screen::linux::input_timeline::MappedInputEvent,
            };
            if session_ns.is_none() {
                input.reset_anchor();
            }
            for event in input.drain(session_ns)? {
                match event {
                    MappedInputEvent::Motion {
                        session_ns,
                        delta_x,
                        delta_y,
                    } => self.cursor.push_input(CursorInputEvent {
                        session_ns,
                        delta_x,
                        delta_y,
                    })?,
                    MappedInputEvent::Persistent(InputEvent::MouseButton {
                        session_ns,
                        button,
                        pressed,
                    }) => self.cursor.push_button(RecordedButton {
                        session_ns,
                        button,
                        pressed,
                    })?,
                    MappedInputEvent::Persistent(InputEvent::Shortcut { .. }) => {}
                }
            }
        }
        #[cfg(not(target_os = "linux"))]
        let _ = session_ns;
        Ok(())
    }
    pub fn finish(mut self) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        {
            let input_result = self.input.as_mut().map_or(Ok(()), |input| {
                input.stop();
                input.finalize()
            });
            let cursor_result = self.cursor.finish();
            input_result.and(cursor_result)
        }
        #[cfg(any(windows, target_os = "macos"))]
        {
            self.recording
                .take()
                .map_or(Ok(()), |recording| recording.stop())
        }
    }
}
