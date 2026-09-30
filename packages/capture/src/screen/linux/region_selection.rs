use super::{
    pipewire::{PipewireCapture, PipewireCaptureRequest},
    portal::{PreparedPortal, prepare_portal},
};
use crate::{
    CaptureError,
    model::{CursorSelection, PortalSourceKind},
    screen::{
        CursorSampleState, OwnedScreenSample, OwnedVideoFrame, ScreenCaptureMetrics,
        ScreenDiscontinuity, ScreenSampleSink, ScreenSegment, VideoFormat,
    },
    session::StartGate,
};
use serde::Serialize;
use std::{
    sync::{Arc, mpsc},
    time::Duration,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalDisplayGeometry {
    pub position: Option<(i32, i32)>,
    pub size: Option<(i32, i32)>,
}

pub(crate) struct LinuxRegionSelection {
    pub(super) portal: PreparedPortal,
}
struct FirstFrame(Option<mpsc::SyncSender<OwnedVideoFrame>>);
impl ScreenSampleSink for FirstFrame {
    fn begin_segment(&mut self, _: ScreenSegment) -> Result<(), CaptureError> {
        Ok(())
    }
    fn format_changed(&mut self, _: VideoFormat) -> Result<(), CaptureError> {
        Ok(())
    }
    fn push(&mut self, sample: OwnedScreenSample) -> Result<(), CaptureError> {
        if let Some(sender) = self.0.take() {
            sender.send(sample.frame).map_err(|error| {
                CaptureError::Backend(format!("Region preview receiver closed: {error}"))
            })?;
        }
        Ok(())
    }
    fn push_cursor(&mut self, _: u64, _: CursorSampleState) -> Result<(), CaptureError> {
        Ok(())
    }
    fn discontinuity(&mut self, _: ScreenDiscontinuity) -> Result<(), CaptureError> {
        Ok(())
    }
    fn end_segment(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
    fn finish(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
}
impl LinuxRegionSelection {
    pub(crate) fn open(
        cursor: CursorSelection,
    ) -> Result<(Self, OwnedVideoFrame, PortalDisplayGeometry), CaptureError> {
        let portal = prepare_portal(PortalSourceKind::Monitor, cursor)?;
        let geometry = PortalDisplayGeometry {
            position: portal.position,
            size: portal.size,
        };
        // A second connection to this node reuses the same authorized Portal session.
        // Keep its original fd for the recording, rather than requesting a restore token.
        let remote_fd = portal.open_preview_remote_fd()?;
        let gate = Arc::new(StartGate::new());
        let (sender, receiver) = mpsc::sync_channel(1);
        let mut preview = PipewireCapture::prepare(PipewireCaptureRequest {
            remote_fd,
            node_id: portal.node_id,
            stream_scope: portal
                .stream_id
                .clone()
                .unwrap_or_else(|| "region-selection".into()),
            queue_capacity: 2,
            sink: Box::new(FirstFrame(Some(sender))),
            start_ns: 0,
            start_gate: gate.clone(),
            metrics: Arc::new(ScreenCaptureMetrics::default()),
            repair_window_crop: false,
            region: None,
        })?;
        let frame = (|| {
            gate.release(0)?;
            preview.start()?;
            receiver
                .recv_timeout(Duration::from_secs(10))
                .map_err(|error| {
                    CaptureError::Backend(format!(
                        "Region preview did not receive a frame: {error}"
                    ))
                })
        })();
        let stopped = preview.stop();
        let frame = frame?;
        stopped?;
        Ok((Self { portal }, frame, geometry))
    }
}
