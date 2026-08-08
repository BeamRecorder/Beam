use std::sync::Arc;

use crate::{
    CaptureError,
    model::ScreenSelection,
    screen::{ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest},
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
        if request.region.is_some() {
            return Err(CaptureError::InvalidConfiguration(
                "a normalized screen region is not supported by the Portal picker".into(),
            ));
        }
        let ScreenConsumer::Samples(sink) = request.consumer else {
            return Err(CaptureError::Unsupported(
                "Linux raw acquisition has no product video segment sink yet".into(),
            ));
        };
        let mut portal = super::portal::prepare_portal(kind.clone(), request.cursor)?;
        let remote_fd = portal.take_remote_fd()?;
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
        })?;
        Ok(Self {
            portal: Some(portal),
            pipewire: Some(pipewire),
            metrics,
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
    ) -> Result<(), CaptureError> {
        self.pipewire
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "Stopped".into(),
                to: "Recording".into(),
            })?
            .resume(start_ns, start_gate)
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

    #[must_use]
    pub fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
        self.metrics.clone()
    }
}

impl Drop for LinuxRecording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
