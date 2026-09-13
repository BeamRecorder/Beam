use super::{ScreenshotRequest, backend_error};
use crate::{
    CaptureError,
    model::{CursorSelection, RecordingSettings},
    screen::{
        CursorSampleState, OwnedScreenSample, OwnedVideoFrame, ScreenConsumer, ScreenDiscontinuity,
        ScreenOpenRequest, ScreenRecording, ScreenSampleSink, ScreenSegment, VideoFormat,
    },
    session::StartGate,
};
use std::{
    sync::{Arc, mpsc},
    time::Duration,
};

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
            sender.send(sample.frame).map_err(backend_error)?;
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

pub(super) fn capture(request: &ScreenshotRequest) -> Result<OwnedVideoFrame, CaptureError> {
    let (sender, receiver) = mpsc::sync_channel(1);
    let gate = Arc::new(StartGate::new());
    let mut recording = ScreenRecording::open(ScreenOpenRequest {
        selection: &request.screen,
        recording: &RecordingSettings::default(),
        region: request.region,
        cursor: CursorSelection::Disabled,
        excluded_window_handles: &request.excluded_window_handles,
        start_ns: 0,
        start_gate: gate.clone(),
        consumer: ScreenConsumer::Samples(Box::new(FirstFrame(Some(sender)))),
    })?;
    let frame = (|| {
        gate.release(0)?;
        recording.start()?;
        receiver
            .recv_timeout(Duration::from_secs(10))
            .map_err(backend_error)
    })();
    let stopped = recording.stop();
    let frame = frame?;
    stopped?;
    Ok(frame)
}
