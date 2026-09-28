#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::*;
use crate::model::{CursorSelection, RecordingSettings, SourceId};
use crate::screen::{CursorSampleState, ScreenDiscontinuity, ScreenSampleSink};

struct Sink(Sender<&'static str>);
impl ScreenSampleSink for Sink {
    fn begin_segment(&mut self, _: ScreenSegment) -> Result<(), CaptureError> {
        Ok(())
    }
    fn format_changed(&mut self, _: VideoFormat) -> Result<(), CaptureError> {
        Ok(())
    }
    fn push(&mut self, _: OwnedScreenSample) -> Result<(), CaptureError> {
        self.0.send("frame").unwrap();
        Ok(())
    }
    fn push_cursor(&mut self, _: u64, _: CursorSampleState) -> Result<(), CaptureError> {
        Ok(())
    }
    fn discontinuity(&mut self, _: ScreenDiscontinuity) -> Result<(), CaptureError> {
        Ok(())
    }
    fn end_segment(&mut self) -> Result<(), CaptureError> {
        self.0.send("paused").unwrap();
        Ok(())
    }
    fn finish(&mut self) -> Result<(), CaptureError> {
        self.0.send("finished").unwrap();
        Ok(())
    }
}
#[test]
#[ignore = "requires the private X11 display"]
fn direct_acquisition_respects_start_gate_pause_resume_and_shutdown() {
    use super::super::checks::Fixture;
    let fixture = Fixture::new(0xff0000);
    let selection = ScreenSelection::Source {
        source_id: SourceId::new(format!("x11:window:{}", fixture.window)).unwrap(),
    };
    let gate = Arc::new(StartGate::new());
    let (events, receiver) = mpsc::channel();
    let recording = RecordingSettings::default();
    let mut capture = X11Recording::open(ScreenOpenRequest {
        selection: &selection,
        recording: &recording,
        region: None,
        cursor: CursorSelection::Disabled,
        excluded_window_handles: &[],
        start_ns: 0,
        start_gate: gate.clone(),
        consumer: ScreenConsumer::Samples(Box::new(Sink(events))),
    })
    .unwrap();
    capture.start().unwrap();
    assert!(receiver.recv_timeout(Duration::from_millis(80)).is_err());
    gate.release(0).unwrap();
    assert_eq!(
        receiver.recv_timeout(Duration::from_secs(2)).unwrap(),
        "frame"
    );
    capture.pause().unwrap();
    while receiver.recv_timeout(Duration::from_secs(2)).unwrap() != "paused" {}
    assert!(receiver.recv_timeout(Duration::from_millis(80)).is_err());
    capture.prepare_resume(100, gate, None).unwrap();
    capture.start().unwrap();
    assert_eq!(
        receiver.recv_timeout(Duration::from_secs(2)).unwrap(),
        "frame"
    );
    capture.stop().unwrap();
    assert!(!capture.is_available());
    assert!(receiver.try_iter().any(|event| event == "finished"));
    capture.stop().unwrap();
}
