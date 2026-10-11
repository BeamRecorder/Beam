#![cfg(all(windows, feature = "hardware-tests", feature = "cursor"))]
#![allow(clippy::expect_used)]

use capture::{
    catalog::{NativeCatalog, SourceCatalog},
    model::{
        CaptureRequest, CursorSelection, FailurePolicy, ProjectId, RecordingSettings, ScreenRegion,
        ScreenSelection, SessionManifest, SourceKind, TrackKind, TrackStatus,
    },
    session::RecordingSession,
};
use std::{
    path::Path,
    process::Command,
    time::{Duration, Instant},
};
use windows::Win32::System::{
    ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX},
    Threading::{GetCurrentProcess, GetProcessHandleCount},
    WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize},
};

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn setting(name: &str, fallback: u64) -> u64 {
    std::env::var(name).map_or(fallback, |value| {
        value.parse().expect("numeric soak setting")
    })
}

fn resources() -> (usize, u32) {
    let mut memory = PROCESS_MEMORY_COUNTERS_EX::default();
    memory.cb = size_of_val(&memory) as u32;
    let mut handles = 0;
    // SAFETY: the pseudo handle belongs to this process; both writable buffers
    // are live and the extended memory structure advertises its actual size.
    unsafe {
        GetProcessMemoryInfo(GetCurrentProcess(), (&raw mut memory).cast(), memory.cb)
            .expect("process memory counters");
        GetProcessHandleCount(GetCurrentProcess(), &mut handles).expect("process handles");
    }
    (memory.PrivateUsage, handles)
}

#[test]
#[ignore = "records the real Windows desktop for eight hours; run explicitly on a dedicated machine"]
fn real_windows_recording_soak() {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.expect("WinRT apartment");
    let _apartment = Apartment;
    let snapshot = NativeCatalog::default()
        .snapshot()
        .expect("Windows catalog");
    let requested = std::env::var("BEAM_CAPTURE_SOAK_SOURCE").ok();
    let source = snapshot
        .sources
        .iter()
        .find(|source| {
            requested.as_ref().map_or(
                source.kind == SourceKind::Display && source.is_default,
                |id| source.id.as_str() == id,
            )
        })
        .expect("requested source or primary display");
    let source_id = source.id.clone();
    let output_root = std::env::var_os("BEAM_CAPTURE_SOAK_OUTPUT").map_or_else(
        || std::env::temp_dir().join(format!("beam-recording-soak-{}", uuid::Uuid::now_v7())),
        Into::into,
    );
    let region =
        (std::env::var("BEAM_CAPTURE_SOAK_REGION").as_deref() == Ok("1")).then_some(ScreenRegion {
            x: 0.1,
            y: 0.1,
            width: 0.8,
            height: 0.8,
        });
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source { source_id }),
        system_audio: None,
        cursor: CursorSelection::Separate {
            capture_clicks: true,
            capture_shortcuts: true,
            capture_shape: true,
        },
        recording: RecordingSettings {
            output_root,
            ..RecordingSettings::default()
        },
        failure_policy: FailurePolicy::FailFast,
        region,
        excluded_process_id: None,
        excluded_window_handles: vec![],
        hide_taskbar: false,
        hide_desktop_icons: false,
        show_real_cursor: false,
    };
    let mut session = RecordingSession::prepare(request, snapshot).expect("prepare real capture");
    session.start().expect("start real capture");
    let duration = Duration::from_secs(setting("BEAM_CAPTURE_SOAK_SECONDS", 8 * 60 * 60));
    assert!(duration >= Duration::from_secs(3));
    let pause_every = setting("BEAM_CAPTURE_SOAK_PAUSE_SECONDS", 0);
    let started = Instant::now();
    let mut next_pause = pause_every;
    let mut baseline = None;
    while started.elapsed() < duration {
        std::thread::sleep(Duration::from_secs(1));
        assert_eq!(
            session.screen_capture_error(),
            None,
            "capture must not silently stop"
        );
        assert_eq!(session.input_capture_error().expect("input health"), None);
        if pause_every > 0 && started.elapsed().as_secs() >= next_pause {
            session.pause().expect("pause under load");
            std::thread::sleep(Duration::from_millis(100));
            session.resume().expect("resume under load");
            next_pause += pause_every;
        }
        if started.elapsed() >= Duration::from_secs(60) {
            let (memory, handles) = resources();
            let (initial_memory, initial_handles) = *baseline.get_or_insert((memory, handles));
            assert!(
                memory <= initial_memory + 512 * 1024 * 1024,
                "private memory grew by more than 512 MiB after warmup: {initial_memory} -> {memory}"
            );
            assert!(
                handles <= initial_handles + 64,
                "native handles grew by more than 64 after warmup: {initial_handles} -> {handles}"
            );
        }
    }
    let manifest_path = session.stop().expect("finalize entire session");
    let manifest: SessionManifest = capture::storage::read_json(&manifest_path).expect("manifest");
    let screen = manifest
        .tracks
        .iter()
        .find(|track| track.kind == TrackKind::Screen)
        .expect("screen track");
    assert!(manifest.completed);
    assert_eq!(screen.status, TrackStatus::Completed);
    assert!(screen.metrics.frames_encoded > 0);
    assert_eq!(
        screen.metrics.frames_processed,
        screen.metrics.frames_submitted
    );
    let root = manifest_path.parent().expect("session directory");
    for segment in &screen.segments {
        assert!(segment.complete);
        verify_media(
            &root.join(&segment.path),
            segment
                .end_ns
                .expect("segment end")
                .saturating_sub(segment.start_ns) as f64
                / 1e9,
        );
    }
    // Artifacts intentionally survive both success and failure for inspection.
    assert!(root.join("cursor/cursor.json").is_file());
    assert!(root.join("cursor/input.json").is_file());
}

fn verify_media(path: &Path, expected_seconds: f64) {
    let ffmpeg = std::env::var_os("BEAM_CAPTURE_TEST_FFMPEG").unwrap_or_else(|| "ffmpeg".into());
    let ffprobe = Path::new(&ffmpeg).with_file_name("ffprobe.exe");
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
        ])
        .arg(path)
        .output()
        .expect("probe real MP4 duration");
    assert!(output.status.success());
    let duration: f64 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .expect("MP4 duration");
    assert!(
        (duration - expected_seconds).abs() < 2.0,
        "MP4 must retain real elapsed time including static intervals: {duration} vs {expected_seconds} ({path:?})"
    );
    assert!(
        Command::new(ffmpeg)
            .args(["-v", "error", "-xerror", "-i"])
            .arg(path)
            .args(["-map", "0:v:0", "-f", "null", "-"])
            .status()
            .expect("decode entire MP4")
            .success(),
        "every frame must decode, including the end of a long recording"
    );
}
