#![cfg(test)]
#![allow(clippy::expect_used)]

use super::argument_value_from;

#[cfg(target_os = "linux")]
#[path = "capture_probe/options.rs"]
mod option_checks;

#[cfg(target_os = "linux")]
use super::{LinuxProbeSummary, ProbeSink};

#[cfg(target_os = "linux")]
#[test]
fn linux_probe_sink_accumulates_frames_cursor_updates_and_discontinuities()
-> Result<(), Box<dyn std::error::Error>> {
    use std::sync::{Arc, Mutex};

    use capture::{
        cursor::CursorKind,
        screen::{
            CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
            ScreenDiscontinuity, ScreenSampleSink, ScreenSegment, TimestampSource, VideoFormat,
        },
    };

    let summary = Arc::new(Mutex::new(LinuxProbeSummary::default()));
    let mut sink = ProbeSink(summary.clone());
    let format = VideoFormat {
        width: 2,
        height: 1,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
    };
    let cursor = CursorSampleState::Known {
        native_cursor_id: "cursor-1".into(),
        cursor_kind: CursorKind::Default,
        pixel_x: 1,
        pixel_y: 0,
        normalized_x: 0.5,
        normalized_y: 0.0,
        visible: true,
        hotspot: None,
    };
    sink.begin_segment(ScreenSegment {
        path: "unused".into(),
        start_ns: 0,
    })?;
    sink.format_changed(format)?;
    sink.push(OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 2,
            height: 1,
            stride: 8,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from(vec![0; 8]),
        },
        timestamp: FrameTimestamp {
            session_ns: 10,
            native_pts_ns: Some(100),
            source: TimestampSource::NativePresentation,
        },
        sequence: 1,
        cursor: cursor.clone(),
    })?;
    sink.push_cursor(15, cursor)?;
    sink.push(OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 2,
            height: 1,
            stride: 8,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from(vec![0; 8]),
        },
        timestamp: FrameTimestamp {
            session_ns: 20,
            native_pts_ns: None,
            source: TimestampSource::MonotonicArrival,
        },
        sequence: 2,
        cursor: CursorSampleState::Unknown,
    })?;
    sink.discontinuity(ScreenDiscontinuity {
        session_ns: 20,
        lost_frames: 3,
        code: "test-gap".into(),
        message: "gap".into(),
    })?;
    sink.end_segment()?;
    sink.finish()?;

    let observed = summary.lock().map_err(|error| error.to_string())?;
    assert_eq!(observed.format, Some(format));
    assert_eq!(observed.samples, 2);
    assert_eq!(observed.cursor_samples, 2);
    assert_eq!(observed.discontinuities, 1);
    assert_eq!(observed.lost_frames, 3);
    assert_eq!(observed.first_session_ns, Some(10));
    assert_eq!(observed.last_session_ns, Some(20));
    assert_eq!(observed.last_native_pts_ns, None);
    assert_eq!(
        observed.timestamp_source,
        Some(TimestampSource::MonotonicArrival)
    );
    assert!(observed.finished);
    Ok(())
}

#[test]
fn probe_argument_lookup_distinguishes_missing_flags_and_values() {
    let value = argument_value_from(
        ["probe", "formats", "--source", "camera-a"]
            .into_iter()
            .map(str::to_owned),
        "--source",
    )
    .expect("source ID");
    assert_eq!(value, "camera-a");
    let missing = argument_value_from(
        ["probe", "formats"].into_iter().map(str::to_owned),
        "--source",
    )
    .expect_err("missing flag");
    assert!(missing.to_string().contains("missing argument --source"));
    let missing_value = argument_value_from(
        ["probe", "formats", "--source"]
            .into_iter()
            .map(str::to_owned),
        "--source",
    )
    .expect_err("missing value");
    assert!(
        missing_value
            .to_string()
            .contains("missing value for --source")
    );
}

#[test]
fn probe_argument_lookup_uses_first_matching_flag_and_preserves_empty_values() {
    let first = argument_value_from(
        ["probe", "--source", "first", "--source", "second"]
            .into_iter()
            .map(str::to_owned),
        "--source",
    )
    .expect("first source");
    assert_eq!(first, "first");

    let empty = argument_value_from(
        ["probe", "--source", "", "--source", "later"]
            .into_iter()
            .map(str::to_owned),
        "--source",
    )
    .expect("empty argument is present");
    assert!(empty.is_empty());

    let value = argument_value_from(
        ["probe", "--other", "--source", "--source", "last"]
            .into_iter()
            .map(str::to_owned),
        "--source",
    )
    .expect("first flag consumes next token");
    assert_eq!(value, "--source");
}

#[cfg(target_os = "linux")]
#[test]
fn linux_probe_sink_saturates_counters_and_tracks_cursor_only_timestamps()
-> Result<(), Box<dyn std::error::Error>> {
    use std::sync::{Arc, Mutex};

    use capture::screen::{CursorSampleState, ScreenDiscontinuity, ScreenSampleSink};

    let summary = Arc::new(Mutex::new(LinuxProbeSummary {
        samples: u64::MAX,
        cursor_samples: u64::MAX,
        discontinuities: u64::MAX,
        lost_frames: u64::MAX,
        ..LinuxProbeSummary::default()
    }));
    let mut sink = ProbeSink(summary.clone());
    sink.push_cursor(7, CursorSampleState::Unknown)?;
    sink.discontinuity(ScreenDiscontinuity {
        session_ns: 9,
        lost_frames: 8,
        code: "gap".into(),
        message: "gap".into(),
    })?;
    sink.finish()?;
    let observed = summary.lock().map_err(|error| error.to_string())?;
    assert_eq!(observed.samples, u64::MAX);
    assert_eq!(observed.cursor_samples, u64::MAX);
    assert_eq!(observed.discontinuities, u64::MAX);
    assert_eq!(observed.lost_frames, u64::MAX);
    assert_eq!(observed.first_session_ns, Some(7));
    assert_eq!(observed.last_session_ns, Some(7));
    assert!(observed.finished);
    Ok(())
}

#[cfg(target_os = "linux")]
#[test]
#[allow(clippy::panic, reason = "poison the test-only mutex deliberately")]
fn linux_probe_sink_reports_poisoned_summary_lock() {
    use std::sync::{Arc, Mutex};

    use capture::screen::{CursorSampleState, ScreenSampleSink};

    let summary = Arc::new(Mutex::new(LinuxProbeSummary::default()));
    let poison = summary.clone();
    let thread = std::thread::spawn(move || {
        let _guard = poison.lock().expect("summary lock");
        panic!("poison summary lock");
    });
    assert!(thread.join().is_err());
    let mut sink = ProbeSink(summary);
    let error = sink
        .push_cursor(1, CursorSampleState::Unknown)
        .expect_err("poisoned summary must fail");
    assert!(error.to_string().contains("summary lock was poisoned"));
    assert!(sink.finish().is_err());
    assert!(
        sink.begin_segment(capture::screen::ScreenSegment {
            path: "unused".into(),
            start_ns: 0
        })
        .is_ok()
    );
    assert!(sink.end_segment().is_ok());
}

#[cfg(target_os = "linux")]
#[test]
fn linux_probe_sink_saturates_frame_count_without_overwriting_first_timestamp()
-> Result<(), Box<dyn std::error::Error>> {
    use std::sync::{Arc, Mutex};

    use capture::screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenSampleSink, TimestampSource,
    };

    let summary = Arc::new(Mutex::new(LinuxProbeSummary {
        samples: u64::MAX,
        first_session_ns: Some(4),
        ..LinuxProbeSummary::default()
    }));
    let mut sink = ProbeSink(summary.clone());
    sink.push(OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 1,
            height: 1,
            stride: 4,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from(vec![0; 4]),
        },
        timestamp: FrameTimestamp {
            session_ns: 9,
            native_pts_ns: Some(90),
            source: TimestampSource::NativePresentation,
        },
        sequence: 1,
        cursor: CursorSampleState::Unknown,
    })?;
    let observed = summary.lock().map_err(|error| error.to_string())?;
    assert_eq!(observed.samples, u64::MAX);
    assert_eq!(observed.cursor_samples, 0);
    assert_eq!(observed.first_session_ns, Some(4));
    assert_eq!(observed.last_session_ns, Some(9));
    assert_eq!(observed.last_native_pts_ns, Some(90));
    Ok(())
}
