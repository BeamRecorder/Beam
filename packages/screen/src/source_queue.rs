use crate::{
    CaptureError, ScreenQueueLimits,
    screen::{
        CursorSampleState, OwnedScreenSample, ScreenDiscontinuity, ScreenSampleSink, ScreenSegment,
        VideoFormat,
    },
};
use beam_media_core::{LatestFrame, MonotonicClock, SessionClock, StartGate};
use std::{
    collections::VecDeque,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc,
    },
};

pub(crate) struct SampleQueue {
    frames: Mutex<(VecDeque<OwnedScreenSample>, usize)>,
    pub(crate) preview: Arc<LatestFrame<OwnedScreenSample>>,
    limits: ScreenQueueLimits,
    pub(crate) dropped: AtomicU64,
    failure: Mutex<Option<String>>,
    pub(crate) cursors: Mutex<VecDeque<(u64, CursorSampleState)>>,
}
impl SampleQueue {
    pub(crate) fn new(limits: ScreenQueueLimits) -> Result<Arc<Self>, CaptureError> {
        if limits.frames == 0 || limits.bytes == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "screen queue limits must be positive".into(),
            ));
        }
        Ok(Arc::new(Self {
            frames: Mutex::new((VecDeque::new(), 0)),
            preview: Arc::new(LatestFrame::new()),
            limits,
            dropped: AtomicU64::new(0),
            failure: Mutex::new(None),
            cursors: Mutex::new(VecDeque::new()),
        }))
    }
    pub(crate) fn push(&self, sample: OwnedScreenSample) {
        self.preview.publish(sample.clone());
        let mut state = self
            .frames
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let bytes = sample.frame.pixels.len();
        if state.0.len() >= self.limits.frames || bytes > self.limits.bytes.saturating_sub(state.1)
        {
            self.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        state.1 += bytes;
        state.0.push_back(sample);
    }
    pub(crate) fn pop(&self) -> Result<Option<OwnedScreenSample>, CaptureError> {
        let mut state = self
            .frames
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(sample) = state.0.pop_front() {
            state.1 -= sample.frame.pixels.len();
            return Ok(Some(sample));
        }
        if let Some(error) = self
            .failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .as_ref()
        {
            return Err(CaptureError::Backend(error.clone()));
        }
        Ok(None)
    }
    pub(crate) fn depth(&self) -> (usize, usize) {
        let state = self
            .frames
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        (state.0.len(), state.1)
    }
    pub(crate) fn fail(&self, reason: String) {
        self.failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get_or_insert(reason);
    }
}

pub(crate) struct QueueSink {
    pub(crate) queue: Arc<SampleQueue>,
    pub(crate) clock: SessionClock,
    pub(crate) gate: Arc<StartGate>,
    pub(crate) ready: Option<mpsc::SyncSender<VideoFormat>>,
    pub(crate) format: Option<VideoFormat>,
}
impl ScreenSampleSink for QueueSink {
    fn begin_segment(&mut self, _: ScreenSegment) -> Result<(), CaptureError> {
        Ok(())
    }
    fn format_changed(&mut self, format: VideoFormat) -> Result<(), CaptureError> {
        if self.ready.is_none() && self.format.is_some_and(|old| old != format) {
            self.queue
                .fail("screen format changed during recording".into());
            return Err(CaptureError::Backend(
                "screen format changed during recording".into(),
            ));
        }
        self.format = Some(format);
        Ok(())
    }
    fn push(&mut self, mut sample: OwnedScreenSample) -> Result<(), CaptureError> {
        let format = VideoFormat {
            width: sample.frame.width,
            height: sample.frame.height,
            stride: sample.frame.stride,
            pixel_format: sample.frame.pixel_format,
        };
        self.format_changed(format)?;
        if let Some(ready) = self.ready.take() {
            let _ = ready.send(format);
        }
        let Some(session_ns) = self.gate.session_ns(self.clock.now_ns()) else {
            sample.timestamp.session_ns = self.gate.elapsed_ns(self.clock.now_ns()).unwrap_or(0);
            self.queue.preview.publish(sample);
            return Ok(());
        };
        // Arrival uses the shared session clock; retain native PTS for drift diagnostics.
        sample.timestamp.session_ns = session_ns;
        sample.timestamp.source = crate::screen::TimestampSource::MonotonicArrival;
        self.queue.push(sample);
        Ok(())
    }
    fn push_cursor(&mut self, _: u64, cursor: CursorSampleState) -> Result<(), CaptureError> {
        let Some(session_ns) = self.gate.session_ns(self.clock.now_ns()) else {
            return Ok(());
        };
        let mut queue = self
            .queue
            .cursors
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if queue.len() == 4096 {
            self.queue.fail("cursor event queue saturated".into());
            return Err(CaptureError::Backend("cursor event queue saturated".into()));
        }
        queue.push_back((session_ns, cursor));
        Ok(())
    }
    fn discontinuity(&mut self, event: ScreenDiscontinuity) -> Result<(), CaptureError> {
        self.queue
            .dropped
            .fetch_add(event.lost_frames, Ordering::Relaxed);
        Ok(())
    }
    fn end_segment(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
    fn finish(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
}

#[path = "../test/source_queue.rs"]
mod queue_checks;
