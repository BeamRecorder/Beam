#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use std::{
    os::fd::AsRawFd,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use crate::screen::{CursorSampleState, OwnedScreenSample, PixelFormat, ScreenDiscontinuity};

use super::*;

#[derive(Default)]
struct SinkLog {
    events: Mutex<Vec<&'static str>>,
    fail_finish: bool,
    fail_begin: AtomicBool,
    fail_end: AtomicBool,
}

struct TestSink(Arc<SinkLog>);

impl ScreenSampleSink for TestSink {
    fn begin_segment(&mut self, _: ScreenSegment) -> Result<(), CaptureError> {
        self.0.events.lock().expect("sink log").push("begin");
        if self.0.fail_begin.load(Ordering::Acquire) {
            Err(CaptureError::Backend("fixture begin failed".into()))
        } else {
            Ok(())
        }
    }

    fn format_changed(&mut self, _: VideoFormat) -> Result<(), CaptureError> {
        Ok(())
    }

    fn push(&mut self, _: OwnedScreenSample) -> Result<(), CaptureError> {
        Ok(())
    }

    fn push_cursor(&mut self, _: u64, _: CursorSampleState) -> Result<(), CaptureError> {
        Ok(())
    }

    fn discontinuity(&mut self, _: ScreenDiscontinuity) -> Result<(), CaptureError> {
        Ok(())
    }

    fn end_segment(&mut self) -> Result<(), CaptureError> {
        self.0.events.lock().expect("sink log").push("end");
        if self.0.fail_end.load(Ordering::Acquire) {
            Err(CaptureError::Backend("fixture end failed".into()))
        } else {
            Ok(())
        }
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.0.events.lock().expect("sink log").push("finish");
        if self.0.fail_finish {
            Err(CaptureError::Backend("fixture finish failed".into()))
        } else {
            Ok(())
        }
    }
}

struct Fixture {
    request: PipewireCaptureRequest,
    gate: Arc<StartGate>,
    metrics: Arc<ScreenCaptureMetrics>,
    sink: Arc<SinkLog>,
}

fn fixture(queue_capacity: usize, fail_finish: bool) -> Fixture {
    let gate = Arc::new(StartGate::new());
    let metrics = Arc::new(ScreenCaptureMetrics::default());
    let sink = Arc::new(SinkLog {
        fail_finish,
        ..SinkLog::default()
    });
    let request = PipewireCaptureRequest {
        remote_fd: std::fs::File::open("/dev/null").expect("local fd").into(),
        node_id: 37,
        stream_scope: "fixture-stream".into(),
        queue_capacity,
        sink: Box::new(TestSink(sink.clone())),
        start_ns: 1234,
        start_gate: gate.clone(),
        metrics: metrics.clone(),
        repair_window_crop: true,
        region: Some(ScreenRegion {
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
        }),
    };
    Fixture {
        request,
        gate,
        metrics,
        sink,
    }
}

fn video_format() -> VideoFormat {
    VideoFormat {
        width: 320,
        height: 240,
        stride: 1280,
        pixel_format: PixelFormat::Bgra8,
    }
}

fn assert_finished_once(sink: &SinkLog) {
    assert_eq!(*sink.events.lock().expect("sink log"), ["finish"]);
}

#[test]
fn zero_queue_rejects_before_spawning_worker_or_finishing_sink() {
    let fixture = fixture(0, false);
    let error = PipewireCapture::prepare_with_worker(fixture.request, |_| {
        panic!("zero queue must reject before worker spawn")
    })
    .err()
    .expect("invalid queue");
    assert!(matches!(error, CaptureError::InvalidConfiguration(_)));
    assert!(fixture.sink.events.lock().expect("sink log").is_empty());
}

#[test]
fn successful_prepare_transfers_all_config_and_stops_with_one_sink_finish() {
    let fixture = fixture(2, false);
    let gate = fixture.gate.clone();
    let metrics = fixture.metrics.clone();
    let sink = fixture.sink.clone();
    let region = fixture.request.region;
    let mut capture = PipewireCapture::prepare_with_worker(fixture.request, move |config| {
        let path = std::fs::read_link(format!("/proc/self/fd/{}", config.remote_fd.as_raw_fd()))
            .expect("fd path");
        assert_eq!(path, PathBuf::from("/dev/null"));
        assert_eq!(config.node_id, 37);
        assert_eq!(config.stream_scope, "fixture-stream");
        assert_eq!(config.start_ns, 1234);
        assert!(Arc::ptr_eq(&config.start_gate, &gate));
        assert!(Arc::ptr_eq(&config.metrics, &metrics));
        assert!(config.repair_window_crop);
        assert_eq!(config.region, region);
        assert!(!config.sink.is_full());
        assert!(!config.cursor_sink.is_full());
        config.ready.send(Ok(video_format())).expect("send ready");
        Ok(())
    })
    .expect("prepare capture");
    assert_eq!(capture.video_format(), video_format());
    assert_eq!(capture.start_ns, 1234);
    assert!(Arc::ptr_eq(&capture.start_gate, &fixture.gate));
    capture.stop().expect("stop prepared capture");
    assert_finished_once(&sink);
}

#[test]
fn stop_command_reaches_mock_pipewire_loop_after_ready() {
    let fixture = fixture(1, false);
    let seen_stop = Arc::new(AtomicBool::new(false));
    let worker_seen_stop = seen_stop.clone();
    let mut capture = PipewireCapture::prepare_with_worker(fixture.request, move |config| {
        pw::init();
        let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
        let command_loop = mainloop.clone();
        let attached = config.commands.attach(mainloop.loop_(), move |command| {
            if matches!(command, PipewireCommand::Stop) {
                worker_seen_stop.store(true, Ordering::SeqCst);
                command_loop.quit();
            }
        });
        config.ready.send(Ok(video_format())).expect("send ready");
        mainloop.run();
        drop(attached);
        Ok(())
    })
    .expect("prepare capture");
    capture.stop().expect("stop capture");
    assert!(seen_stop.load(Ordering::SeqCst));
    assert_finished_once(&fixture.sink);
}

#[test]
fn ready_error_is_returned_when_no_worker_fatal_exists() {
    let fixture = fixture(1, false);
    let sink = fixture.sink.clone();
    let error = PipewireCapture::prepare_with_worker(fixture.request, |config| {
        config
            .ready
            .send(Err(CaptureError::Backend("negotiation rejected".into())))
            .expect("send ready error");
        Ok(())
    })
    .err()
    .expect("prepare failure");
    assert_eq!(error.code(), "capture-error");
    assert!(error.to_string().contains("negotiation rejected"));
    assert_finished_once(&sink);
}

#[test]
fn fatal_error_has_priority_over_ready_error() {
    let fixture = fixture(1, false);
    let sink = fixture.sink.clone();
    let error = PipewireCapture::prepare_with_worker(fixture.request, |config| {
        set_fatal(
            &config.fatal,
            CaptureError::Backend("fatal worker error".into()),
        );
        config
            .ready
            .send(Err(pipewire_error("ready error")))
            .expect("send ready error");
        Ok(())
    })
    .err()
    .expect("prepare failure");
    assert_eq!(error.code(), "capture-error");
    assert!(error.to_string().contains("fatal worker error"));
    assert_finished_once(&sink);
}

#[test]
fn error_panic_and_clean_exit_before_ready_fail_immediately() {
    for mode in 0..3 {
        let fixture = fixture(1, false);
        let sink = fixture.sink.clone();
        let start = Instant::now();
        let result = PipewireCapture::prepare_with_worker(fixture.request, move |_| match mode {
            0 => Err(CaptureError::Backend("worker failed before ready".into())),
            1 => panic!("worker panicked before ready"),
            _ => Ok(()),
        });
        let error = result.err().expect("worker did not report ready");
        match mode {
            0 => assert!(error.to_string().contains("worker failed before ready")),
            1 => assert!(error.to_string().contains("PipeWire worker panicked")),
            _ => assert!(
                error
                    .to_string()
                    .contains("exited before stream negotiation completed")
            ),
        }
        assert!(start.elapsed() < Duration::from_secs(2));
        assert_finished_once(&sink);
    }
}

#[test]
fn worker_error_after_ready_surfaces_when_capture_stops() {
    let fixture = fixture(1, false);
    let sink = fixture.sink.clone();
    let mut capture = PipewireCapture::prepare_with_worker(fixture.request, |config| {
        config.ready.send(Ok(video_format())).expect("send ready");
        Err(CaptureError::Backend("worker failed after ready".into()))
    })
    .expect("prepare succeeds after ready");
    let error = capture.stop().expect_err("worker failure on stop");
    assert_eq!(error.code(), "capture-error");
    assert!(error.to_string().contains("worker failed after ready"));
    assert_finished_once(&sink);
}

#[test]
fn worker_panic_after_ready_surfaces_and_still_finishes_sink() {
    let fixture = fixture(1, false);
    let sink = fixture.sink.clone();
    let mut capture = PipewireCapture::prepare_with_worker(fixture.request, |config| {
        config.ready.send(Ok(video_format())).expect("send ready");
        panic!("worker panicked after ready")
    })
    .expect("prepare succeeds after ready");
    let error = capture.stop().expect_err("worker panic on stop");
    assert_eq!(
        error.code(),
        NativeCaptureErrorCode::PipewireConnectFailed.as_str()
    );
    assert!(error.to_string().contains("PipeWire worker panicked"));
    assert_finished_once(&sink);
}

#[test]
fn sink_finish_error_surfaces_on_stop_after_successful_ready() {
    let fixture = fixture(1, true);
    let sink = fixture.sink.clone();
    let mut capture = PipewireCapture::prepare_with_worker(fixture.request, |config| {
        config.ready.send(Ok(video_format())).expect("send ready");
        Ok(())
    })
    .expect("prepare capture");
    let error = capture.stop().expect_err("sink finish failure");
    assert_eq!(error.code(), "capture-error");
    assert!(error.to_string().contains("fixture finish failed"));
    assert_finished_once(&sink);
}

#[path = "thread_lifecycle.rs"]
mod lifecycle_checks;
