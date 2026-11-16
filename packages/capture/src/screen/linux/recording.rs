use std::sync::Arc;

use crate::{
    CaptureError,
    model::{CursorSelection, ScreenSelection},
    screen::{ScreenCaptureMetrics, ScreenOpenRequest, ScreenSegment, VideoFormat},
    session::StartGate,
};

use super::{
    pipewire::{PipewireCapture, PipewireCaptureRequest},
    portal::PreparedPortal,
};

pub struct LinuxRecording {
    portal: Option<PreparedPortal>,
    x11: Option<super::x11::X11Recording>,
    pipewire: Option<PipewireCapture>,
    metrics: Arc<ScreenCaptureMetrics>,
    encoded_output: bool,
    encoded_codec: Option<String>,
}

impl LinuxRecording {
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        if let ScreenSelection::Source { source_id } = request.selection {
            let prepared = super::screen_sink::prepare(
                request.consumer,
                request.recording,
                request.cursor,
                request.start_ns,
            )?;
            let metrics = Arc::new(ScreenCaptureMetrics::default());
            let capture = super::x11::X11Recording::prepare(super::x11::recording::Request {
                source: source_id,
                region: request.region,
                settings: request.recording,
                sink: prepared.sink,
                gate: request.start_gate,
                cursor: request.cursor,
                show_real_cursor: request.show_real_cursor,
                metrics: metrics.clone(),
                encode: prepared.encoded,
            })?;
            return Ok(Self {
                portal: None,
                pipewire: None,
                x11: Some(capture),
                metrics,
                encoded_output: prepared.encoded,
                encoded_codec: prepared.codec,
            });
        }
        let ScreenSelection::Portal {
            kind,
            restore_token,
        } = request.selection
        else {
            return Err(CaptureError::Unsupported(
                "Linux native screen capture requires the system Portal picker".into(),
            ));
        };
        if restore_token.is_some() {
            return Err(CaptureError::InvalidConfiguration(
                "Linux Portal restore tokens are not supported in non-persistent mode".into(),
            ));
        }
        if request.region.is_some() && !matches!(kind, crate::model::PortalSourceKind::Monitor) {
            return Err(CaptureError::InvalidConfiguration(
                "screen region requires a Portal monitor source".into(),
            ));
        }
        let prepared = super::screen_sink::prepare(
            request.consumer,
            request.recording,
            request.cursor,
            request.start_ns,
        )?;
        let sink = prepared.sink;
        let encoded_output = prepared.encoded;
        let encoded_codec = prepared.codec;
        let mut portal = match request.region_selection {
            Some(selection) => match selection.linux {
                super::LinuxRegionSelection::Portal(portal) => portal,
                super::LinuxRegionSelection::X11 => {
                    return Err(CaptureError::InvalidConfiguration(
                        "A direct X11 selection cannot authorize a Portal recording".into(),
                    ));
                }
            },
            None => super::portal::prepare_portal(kind.clone(), request.cursor)?,
        };
        if !portal.is_available() {
            return Err(CaptureError::native(
                crate::NativeCaptureErrorCode::PortalSessionClosed,
                "The screen selection was closed before recording",
            ));
        }
        let remote_fd = portal.take_remote_fd()?;
        let repair_window_crop = matches!(
            portal.source_type,
            Some(ashpd::desktop::screencast::SourceType::Window)
        ) || matches!(kind, crate::model::PortalSourceKind::Window);
        let stream_scope = portal
            .stream_id
            .clone()
            .unwrap_or_else(|| "ephemeral".into());
        let metrics = Arc::new(ScreenCaptureMetrics::default());
        let pipewire = PipewireCapture::prepare(PipewireCaptureRequest {
            remote_fd,
            node_id: portal.node_id,
            stream_scope,
            queue_capacity: request.recording.queue_capacity,
            sink,
            start_ns: request.start_ns,
            start_gate: request.start_gate,
            metrics: metrics.clone(),
            repair_window_crop,
            region: request.region,
            hyprland_cursor: super::hyprland::HyprlandCursor::for_portal(&portal)?,
            target_fps: request.recording.target_fps,
            show_real_cursor: request.show_real_cursor
                && matches!(request.cursor, CursorSelection::Separate { .. }),
        })?;
        Ok(Self {
            portal: Some(portal),
            x11: None,
            pipewire: Some(pipewire),
            metrics,
            encoded_output,
            encoded_codec,
        })
    }

    pub fn start(&mut self) -> Result<(), CaptureError> {
        if let Some(capture) = &mut self.x11 {
            return capture.start();
        }
        self.pipewire
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "Stopped".into(),
                to: "Recording".into(),
            })?
            .start()
    }

    pub fn pause(&mut self) -> Result<(), CaptureError> {
        if let Some(capture) = &mut self.x11 {
            return capture.pause();
        }
        self.pipewire
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "Stopped".into(),
                to: "Paused".into(),
            })?
            .pause()
    }

    pub fn prepare_resume(
        &mut self,
        start_ns: u64,
        start_gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    ) -> Result<(), CaptureError> {
        if let Some(capture) = &mut self.x11 {
            return capture.prepare_resume(start_gate, segment);
        }
        self.pipewire
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "Stopped".into(),
                to: "Recording".into(),
            })?
            .prepare_resume(start_ns, start_gate, segment)
    }

    pub fn stop(&mut self) -> Result<(), CaptureError> {
        if let Some(mut capture) = self.x11.take() {
            return capture.stop();
        }
        let pipewire_result = self
            .pipewire
            .take()
            .map_or(Ok(()), |mut capture| capture.stop());
        let portal_result = self
            .portal
            .take()
            .map_or(Ok(()), |mut portal| portal.close());
        pipewire_result.and(portal_result)
    }

    pub fn is_available(&self) -> bool {
        if let Some(capture) = &self.x11 {
            return capture.is_available();
        }
        self.portal
            .as_ref()
            .is_none_or(PreparedPortal::is_available)
            && self
                .pipewire
                .as_ref()
                .is_none_or(PipewireCapture::is_available)
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
        self.metrics.clone()
    }

    #[must_use]
    pub fn video_format(&self) -> Option<VideoFormat> {
        self.metrics
            .first_video_format()
            .or_else(|| self.x11.as_ref().map(super::x11::X11Recording::format))
            .or_else(|| self.pipewire.as_ref().map(PipewireCapture::video_format))
            .map(|format| {
                if self.encoded_output {
                    super::encoded_video_format(format)
                } else {
                    format
                }
            })
    }

    pub fn encoded_codec(&self) -> Option<&str> {
        self.encoded_codec.as_deref()
    }
}

impl Drop for LinuxRecording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
