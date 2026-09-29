use std::sync::Arc;

#[path = "../../../test/screen/linux/recording.rs"]
pub(crate) mod recording_checks;

use crate::{
    CaptureError,
    gate::StartGate,
    model::{PortalSourceKind, ScreenRegion, ScreenSelection},
    screen::{ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest, ScreenSegment, VideoFormat},
};

use super::{
    pipewire::{PipewireCapture, PipewireCaptureRequest},
    portal::PreparedPortal,
};

pub struct LinuxRecording {
    portal: Option<PreparedPortal>,
    pipewire: Option<PipewireCapture>,
    metrics: Arc<ScreenCaptureMetrics>,
}

impl LinuxRecording {
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        let kind = validate_portal_request(request.selection, request.region)?;
        let ScreenConsumer::Samples(sink) = request.consumer;
        let mut portal = super::portal::prepare_portal(kind.clone(), request.cursor)?;
        let remote_fd = portal.take_remote_fd()?;
        let repair_window_crop = matches!(
            portal.source_type,
            Some(ashpd::desktop::screencast::SourceType::Window)
        ) || matches!(kind, PortalSourceKind::Window);
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
        })
    }

    pub fn source_id(&self) -> Option<String> {
        self.portal.as_ref().map(|portal| {
            format!(
                "portal:{}:{}",
                portal.node_id,
                portal.stream_id.as_deref().unwrap_or("ephemeral")
            )
        })
    }

    /// Returns the granted source's compositor geometry before its session closes.
    pub(crate) fn source_geometry(&self) -> Option<crate::screen::ScreenSourceGeometry> {
        self.portal.as_ref().map(|portal| portal.geometry)
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

    pub fn prepare_resume(
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
            .prepare_resume(start_ns, start_gate, segment)
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
    }
}

fn validate_portal_request(
    selection: &ScreenSelection,
    region: Option<ScreenRegion>,
) -> Result<PortalSourceKind, CaptureError> {
    let ScreenSelection::Portal {
        kind,
        restore_token,
    } = selection
    else {
        return Err(CaptureError::Unsupported(
            "Linux native screen capture requires the system Portal picker".into(),
        ));
    };
    if restore_token.is_some() {
        return Err(CaptureError::InvalidConfiguration(
            "Linux Portal restore grants are managed internally for this application".into(),
        ));
    }
    if let Some(region) = region {
        region.validate()?;
    }
    Ok(kind.clone())
}

impl Drop for LinuxRecording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
