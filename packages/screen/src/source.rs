use crate::{
    CaptureError, ScreenPreview, ScreenQueueLimits, ScreenRequest, ScreenSource,
    model::{RecordingSettings, ScreenSelection},
    screen::{OwnedScreenSample, ScreenConsumer, ScreenOpenRequest, ScreenRecording, VideoFormat},
    source_queue::{QueueSink, SampleQueue},
};
use beam_media_core::{SessionClock, StartGate};
use std::{
    sync::{Arc, atomic::Ordering, mpsc},
    time::Duration,
};

pub struct ScreenCapture {
    recording: Option<ScreenRecording>,
    queue: Arc<SampleQueue>,
    format: VideoFormat,
    source_id: String,
}

pub fn open_screen(
    request: ScreenRequest,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: ScreenQueueLimits,
) -> Result<ScreenCapture, CaptureError> {
    if request.fps == 0 || request.fps > 240 {
        return Err(CaptureError::InvalidConfiguration(
            "screen fps must be 1–240".into(),
        ));
    }
    if let Some(region) = request.region {
        region.validate()?;
    }
    let queue = SampleQueue::new(limits)?;
    let (ready, prepared) = mpsc::sync_channel(1);
    // Acquisition negotiates the actual Portal/window dimensions before any writer
    // opens. The session gate above alone admits frames to recording/preview queues.
    let acquisition = Arc::new(StartGate::new());
    acquisition.release(0)?;
    let sink = QueueSink {
        queue: queue.clone(),
        clock,
        gate,
        ready: Some(ready),
        format: None,
    };
    let settings = RecordingSettings {
        target_fps: request.fps,
        queue_capacity: limits.frames,
    };
    let mut recording = ScreenRecording::open(ScreenOpenRequest {
        selection: &request.selection,
        recording: &settings,
        region: request.region,
        cursor: request.cursor,
        excluded_window_handles: &request.excluded_window_handles,
        start_ns: 0,
        start_gate: acquisition,
        consumer: ScreenConsumer::Samples(Box::new(sink)),
    })?;
    recording.start()?;
    let format = prepared
        .recv_timeout(Duration::from_secs(10))
        .map_err(|error| {
            CaptureError::Backend(format!(
                "screen did not deliver a negotiated frame: {error}"
            ))
        })?;
    let source_id = match &request.selection {
        ScreenSelection::Source { source_id } => source_id.to_string(),
        ScreenSelection::Portal { .. } => recording.source_id().ok_or_else(|| {
            CaptureError::Backend("Portal did not resolve a source identity".into())
        })?,
    };
    Ok(ScreenCapture {
        recording: Some(recording),
        queue,
        format,
        source_id,
    })
}

impl ScreenSource for ScreenCapture {
    fn format(&self) -> VideoFormat {
        self.format
    }
    fn source_id(&self) -> &str {
        &self.source_id
    }
    fn queue_depth(&self) -> (usize, usize) {
        self.queue.depth()
    }
    fn try_frame(&self) -> Result<Option<OwnedScreenSample>, CaptureError> {
        if self
            .recording
            .as_ref()
            .is_some_and(|recording| !recording.is_available())
        {
            self.queue.fail("native screen source was lost".into());
        }
        self.queue.pop()
    }
    fn preview_handle(&self) -> ScreenPreview {
        self.queue.preview.clone()
    }
    fn dropped_frames(&self) -> u64 {
        self.queue.dropped.load(Ordering::Relaxed)
    }
    fn try_cursor(&self) -> Option<(u64, crate::screen::CursorSampleState)> {
        self.queue
            .cursors
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .pop_front()
    }
    fn halt(&mut self) -> Result<(), CaptureError> {
        self.recording
            .take()
            .map_or(Ok(()), |mut recording| recording.stop())
    }
}
impl Drop for ScreenCapture {
    fn drop(&mut self) {
        let _ = self.halt();
    }
}

#[path = "../test/source_internal.rs"]
mod source_checks;
