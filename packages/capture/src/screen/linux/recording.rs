use std::sync::Arc;

use crate::{
    CaptureError,
    model::{CursorSelection, ScreenSelection},
    screen::{ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest, ScreenSegment, VideoFormat},
    session::StartGate,
};

use super::{
    pipewire::{PipewireCapture, PipewireCaptureRequest},
    portal::PreparedPortal,
};

pub struct LinuxRecording {
    portal: Option<PreparedPortal>,
    pipewire: Option<PipewireCapture>,
    metrics: Arc<ScreenCaptureMetrics>,
    encoded_output: bool,
    encoded_codec: Option<String>,
}

impl LinuxRecording {
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
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
        let (sink, encoded_output, encoded_codec): (
            Box<dyn crate::screen::ScreenSampleSink>,
            bool,
            Option<String>,
        ) = match request.consumer {
            ScreenConsumer::Samples(sink) => (sink, false, None),
            ScreenConsumer::EncodedFile {
                path,
                cursor_directory,
            } => {
                let capabilities = super::probe_ffmpeg()?;
                let codec = capabilities.encoder.codec.clone();
                let capture_interactions = matches!(
                    request.cursor,
                    CursorSelection::Separate {
                        capture_clicks: true,
                        ..
                    } | CursorSelection::Separate {
                        capture_shortcuts: true,
                        ..
                    }
                );
                let sink = super::FfmpegScreenSink::new(
                    capabilities,
                    request.recording.clone(),
                    ScreenSegment {
                        path,
                        start_ns: request.start_ns,
                    },
                    cursor_directory,
                    capture_interactions,
                )?;
                (Box::new(sink), true, Some(codec))
            }
        };
        let mut portal = super::portal::prepare_portal(kind.clone(), request.cursor)?;
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
        })?;
        Ok(Self {
            portal: Some(portal),
            pipewire: Some(pipewire),
            metrics,
            encoded_output,
            encoded_codec,
        })
    }

    pub fn start(&mut self) -> Result<(), CaptureError> {
        self.pipewire
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "Stopped".into(),
                to: "Recording".into(),
            })?
            .start()
    }

    pub fn pause(&mut self) -> Result<(), CaptureError> {
        self.pipewire
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "Stopped".into(),
                to: "Paused".into(),
            })?
            .pause()
    }

    pub fn resume(
        &mut self,
        start_ns: u64,
        start_gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    ) -> Result<(), CaptureError> {
        self.pipewire
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "Stopped".into(),
                to: "Recording".into(),
            })?
            .resume(start_ns, start_gate, segment)
    }

    pub fn stop(&mut self) -> Result<(), CaptureError> {
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
