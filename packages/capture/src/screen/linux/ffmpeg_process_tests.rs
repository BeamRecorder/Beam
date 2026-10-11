#![allow(clippy::expect_used)]

use std::{
    fs,
    io::{BufRead, BufReader, Write},
    os::unix::fs::PermissionsExt,
    path::Path,
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use crate::{
    model::RecordingSettings,
    screen::{
        OwnedScreenSample, OwnedVideoFrame, PixelFormat, ScreenSampleSink, ScreenSegment,
        TimestampSource, VideoFormat,
    },
};

use super::{
    FfmpegCapabilities, FfmpegEncoder, FfmpegScreenSink,
    ffmpeg_process::{FfmpegProcess, FfmpegProcessConfig, arguments, partial_path},
    owned_child,
};

#[test]
fn kill_and_wait_terminates_a_descendant_in_the_owned_process_group() {
    let _lock = owned_child::test_lock();
    let mut command = Command::new("sh");
    command
        .args(["-c", "sleep 30 & printf '%s\\n' \"$!\"; wait"])
        .stdout(Stdio::piped());
    owned_child::configure(&mut command);
    let mut child = command.spawn().expect("spawn process-group test child");
    let child_pid = libc::pid_t::try_from(child.id()).expect("child pid fits pid_t");
    let stdout = child.stdout.take().expect("child stdout");
    let mut stdout = BufReader::new(stdout);
    let mut line = String::new();
    stdout.read_line(&mut line).expect("read descendant pid");
    let descendant_pid = line.trim().parse::<libc::pid_t>().expect("descendant pid");
    assert_eq!(unsafe { libc::kill(descendant_pid, 0) }, 0);

    owned_child::kill_and_wait(&mut child);

    assert!(child.try_wait().expect("reap direct child").is_some());
    let deadline = Instant::now() + Duration::from_secs(2);
    while unsafe { libc::kill(descendant_pid, 0) } == 0 && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert_ne!(unsafe { libc::kill(descendant_pid, 0) }, 0);
    assert_ne!(unsafe { libc::kill(-child_pid, 0) }, 0);
}

#[test]
fn terminate_all_kills_registered_child_and_descendant_before_test_reaps_child() {
    let _lock = owned_child::test_lock();
    let mut command = Command::new("sh");
    command
        .args(["-c", "sleep 30 & printf '%s\\n' \"$!\"; wait"])
        .stdout(Stdio::piped());
    owned_child::configure(&mut command);
    let mut child = command
        .spawn()
        .expect("spawn registered process-group child");
    let child_pid = libc::pid_t::try_from(child.id()).expect("child pid fits pid_t");
    let stdout = child.stdout.take().expect("child stdout");
    let mut stdout = BufReader::new(stdout);
    let mut line = String::new();
    stdout.read_line(&mut line).expect("read descendant pid");
    drop(stdout);
    let descendant_pid = line.trim().parse::<libc::pid_t>().expect("descendant pid");
    assert_eq!(unsafe { libc::kill(descendant_pid, 0) }, 0);

    owned_child::register(&child);
    owned_child::terminate_all();
    let status = child.wait().expect("reap registered child");
    owned_child::unregister(&child);

    assert!(!status.success());
    let deadline = Instant::now() + Duration::from_secs(2);
    while unsafe { libc::kill(descendant_pid, 0) } == 0 && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert_ne!(unsafe { libc::kill(descendant_pid, 0) }, 0);
    assert_ne!(unsafe { libc::kill(-child_pid, 0) }, 0);
}

fn capabilities() -> FfmpegCapabilities {
    FfmpegCapabilities {
        executable: "ffmpeg".into(),
        encoder: FfmpegEncoder::software("libopenh264"),
    }
}

#[test]
fn arguments_preserve_capture_timestamps_instead_of_encoder_arrival_times() {
    let capabilities = capabilities();
    let output = Path::new("screen/segment-0001.mp4");
    let config = FfmpegProcessConfig {
        capabilities: &capabilities,
        output,
        width: 1919,
        height: 1079,
        fps: 60,
        bitrate_bps: 12_000_000,
        keyframe_interval_seconds: 2,
    };
    let values = arguments(&config, Path::new("screen/segment-0001.partial.mp4"));
    assert!(values.windows(2).any(|pair| pair == ["-f", "matroska"]));
    assert!(values.iter().any(|value| value == "-copyts"));
    assert!(
        !values
            .iter()
            .any(|value| value == "-use_wallclock_as_timestamps")
    );
    assert!(values.windows(2).any(|pair| pair == ["-g", "120"]));
    assert!(values.iter().any(|value| value.contains("pad=ceil")));
}

#[test]
fn arguments_keep_the_output_path_as_one_argument() {
    let capabilities = capabilities();
    let output = Path::new("screen with spaces/segment-0001.mp4");
    let config = FfmpegProcessConfig {
        capabilities: &capabilities,
        output,
        width: 16,
        height: 16,
        fps: 30,
        bitrate_bps: 1_000_000,
        keyframe_interval_seconds: 1,
    };
    let values = arguments(
        &config,
        Path::new("screen with spaces/segment-0001.partial.mp4"),
    );
    assert_eq!(
        values.last().map(String::as_str),
        Some("screen with spaces/segment-0001.partial.mp4")
    );
}

#[test]
fn every_recording_encoder_disables_frame_reordering_without_forcing_constant_cadence() {
    use super::FfmpegAcceleration;
    for (name, codec, acceleration) in [
        ("libx264", "h264", FfmpegAcceleration::Software),
        ("libopenh264", "h264", FfmpegAcceleration::Software),
        ("h264_qsv", "h264", FfmpegAcceleration::Qsv),
        ("h264_nvenc", "h264", FfmpegAcceleration::Nvenc),
        ("h264_amf", "h264", FfmpegAcceleration::Amf),
        ("av1_qsv", "av1", FfmpegAcceleration::Qsv),
        ("vp9_qsv", "vp9", FfmpegAcceleration::Qsv),
        (
            "h264_vaapi",
            "h264",
            FfmpegAcceleration::Vaapi {
                device: "/dev/dri/renderD128".into(),
            },
        ),
    ] {
        let capabilities = FfmpegCapabilities {
            executable: "ffmpeg".into(),
            encoder: FfmpegEncoder {
                name: name.into(),
                codec: codec.into(),
                acceleration,
            },
        };
        let values = arguments(
            &FfmpegProcessConfig {
                capabilities: &capabilities,
                output: Path::new("recording.mp4"),
                width: 1280,
                height: 720,
                fps: 60,
                bitrate_bps: 4_000_000,
                keyframe_interval_seconds: 1,
            },
            Path::new("recording.partial.mp4"),
        );
        assert!(values.windows(2).any(|pair| pair == ["-bf", "0"]));
        assert!(values.windows(2).any(|pair| pair == ["-fps_mode", "vfr"]));
        assert!(values.windows(2).any(|pair| pair == ["-c:v", name]));
    }
}

#[test]
fn partial_path_preserves_the_mp4_suffix() {
    assert_eq!(
        partial_path(Path::new("screen/segment-0042.mp4")).expect("partial path"),
        Path::new("screen/segment-0042.partial.mp4")
    );
    assert!(partial_path(Path::new("/")).is_err());
}

fn fake_ffmpeg(script: &str) -> (tempfile::TempDir, FfmpegCapabilities) {
    let directory = tempfile::tempdir().expect("temporary FFmpeg directory");
    let executable = directory.path().join("ffmpeg-fake");
    let mut file = fs::File::create(&executable).expect("create fake FFmpeg");
    file.write_all(script.as_bytes())
        .expect("write fake FFmpeg");
    file.sync_all().expect("sync fake FFmpeg");
    drop(file);
    let mut permissions = fs::metadata(&executable)
        .expect("fake metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&executable, permissions).expect("make fake executable");
    (
        directory,
        FfmpegCapabilities {
            executable,
            encoder: FfmpegEncoder::software("libopenh264"),
        },
    )
}

fn frame(stride: usize, bytes: Vec<u8>) -> OwnedVideoFrame {
    OwnedVideoFrame {
        width: 2,
        height: 2,
        stride,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(bytes),
    }
}

#[test]
fn process_writes_compact_rows_and_atomically_publishes_output() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\ncat > \"$output.input\"\nprintf 'fake-mp4' > \"$output\"\n",
    );
    let output_directory = tempfile::tempdir().expect("temporary output");
    let output = output_directory.path().join("segment-0001.mp4");
    let mut process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width: 2,
        height: 2,
        fps: 30,
        bitrate_bps: 1_000_000,
        keyframe_interval_seconds: 1,
    })
    .expect("spawn fake FFmpeg");
    process
        .write_frame(
            &frame(
                12,
                vec![
                    1, 2, 3, 4, 5, 6, 7, 8, 90, 90, 90, 90, 9, 10, 11, 12, 13, 14, 15, 16, 80, 80,
                    80, 80,
                ],
            ),
            0,
        )
        .expect("write padded frame");
    process.finish().expect("finalize fake FFmpeg");
    let mut expected = super::timestamped_video::stream_header(2, 2, 30);
    expected.extend(super::timestamped_video::frame_header(0, 16).expect("frame header"));
    expected.extend(1_u8..=16);
    assert_eq!(
        fs::read(
            output_directory
                .path()
                .join("segment-0001.partial.mp4.input")
        )
        .expect("input bytes"),
        expected
    );
    assert_eq!(fs::read(&output).expect("read output"), b"fake-mp4");
    assert!(
        !output_directory
            .path()
            .join("segment-0001.partial.mp4")
            .exists()
    );
}

#[test]
fn process_propagates_non_zero_exit_and_removes_partial_output() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf 'broken' > \"$output\"\nprintf 'encoder exploded' >&2\nexit 7\n",
    );
    let output_directory = tempfile::tempdir().expect("temporary output");
    let output = output_directory.path().join("segment-0001.mp4");
    let mut process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width: 2,
        height: 2,
        fps: 30,
        bitrate_bps: 1_000_000,
        keyframe_interval_seconds: 1,
    })
    .expect("spawn fake FFmpeg");
    process
        .write_frame(&frame(8, vec![0; 16]), 0)
        .expect("write frame");
    let error = process.finish().expect_err("non-zero FFmpeg must fail");
    assert_eq!(error.code(), "ffmpeg-failed");
    assert!(!output.exists());
    assert!(
        !output_directory
            .path()
            .join("segment-0001.partial.mp4")
            .exists()
    );
}

#[test]
fn process_rejects_a_segment_without_frames() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf 'header-only' > \"$output\"\n",
    );
    let output_directory = tempfile::tempdir().expect("temporary output");
    let output = output_directory.path().join("segment-0001.mp4");
    let process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width: 2,
        height: 2,
        fps: 30,
        bitrate_bps: 1_000_000,
        keyframe_interval_seconds: 1,
    })
    .expect("spawn fake FFmpeg");
    let error = process.finish().expect_err("empty segment must fail");
    assert_eq!(error.code(), "ffmpeg-output-invalid");
    assert!(!output.exists());
}

#[test]
fn process_rejects_invalid_frames_and_regressing_times_without_corrupting_the_stream() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf 'fake-mp4' > \"$output\"\n",
    );
    let directory = tempfile::tempdir().expect("temporary output");
    let output = directory.path().join("segment.mp4");
    let mut process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width: 2,
        height: 2,
        fps: 30,
        bitrate_bps: 500_000,
        keyframe_interval_seconds: 1,
    })
    .expect("spawn fixture FFmpeg");
    let mut wrong_size = frame(8, vec![0; 16]);
    wrong_size.width = 3;
    assert!(process.write_frame(&wrong_size, 0).is_err());
    assert!(process.write_frame(&frame(4, vec![0; 16]), 0).is_err());
    assert!(process.write_frame(&frame(8, vec![0; 15]), 0).is_err());
    process
        .write_frame(&frame(8, vec![0; 16]), 20)
        .expect("valid first frame");
    assert!(process.write_frame(&frame(8, vec![0; 16]), 10).is_err());
    process
        .write_frame(&frame(8, vec![0; 16]), 30)
        .expect("valid following frame");
    process.finish().expect("stream remains valid");
    assert!(output.is_file());
}

#[test]
fn sink_accepts_the_initial_segment_when_format_arrives_before_frames_and_stop() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf 'fake-mp4' > \"$output\"\n",
    );
    let output_directory = tempfile::tempdir().expect("temporary sink directory");
    let output = output_directory.path().join("segment-0001.mp4");
    let mut sink = FfmpegScreenSink::new(
        capabilities,
        RecordingSettings {
            minimum_free_bytes: 0,
            target_fps: 30,
            ..RecordingSettings::default()
        },
        ScreenSegment {
            path: output.clone(),
            start_ns: 0,
        },
        None,
        false,
    )
    .expect("create FFmpeg sink");

    sink.format_changed(VideoFormat {
        width: 2,
        height: 2,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
    })
    .expect("announce negotiated format");
    sink.push(OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 2,
            height: 2,
            stride: 8,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from(vec![0; 16]),
        },
        timestamp: crate::screen::FrameTimestamp {
            session_ns: 1,
            native_pts_ns: Some(1),
            source: TimestampSource::NativePresentation,
        },
        sequence: 1,
        cursor: crate::screen::CursorSampleState::Unknown,
    })
    .expect("write first frame");
    sink.finish().expect("finalize FFmpeg sink");

    assert_eq!(fs::read(output).expect("read encoded segment"), b"fake-mp4");
}

#[test]
#[ignore = "requires the system FFmpeg runtime"]
fn system_ffmpeg_encodes_a_playable_mp4_segment() {
    let _lock = owned_child::test_lock();
    let capabilities = super::probe_ffmpeg().expect("system FFmpeg capabilities");
    let output_directory = tempfile::tempdir().expect("temporary output");
    let output = output_directory.path().join("segment-0001.mp4");
    // Hardware encoders commonly reject tiny test surfaces even though they
    // support normal desktop resolutions. Keep this smoke test representative
    // of the negotiated Portal format.
    let width = 1280_u32;
    let height = 720_u32;
    let stride = usize::try_from(width).expect("test width") * 4;
    let frame_bytes = stride * usize::try_from(height).expect("test height");
    let mut process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width,
        height,
        fps: 30,
        bitrate_bps: 500_000,
        keyframe_interval_seconds: 1,
    })
    .expect("spawn system FFmpeg");
    for (index, shade) in [0_u8, 32, 64, 96].into_iter().enumerate() {
        process
            .write_frame(
                &OwnedVideoFrame {
                    width,
                    height,
                    stride,
                    pixel_format: PixelFormat::Bgra8,
                    pixels: Arc::from(vec![shade; frame_bytes]),
                },
                index as u64 * 33_333_333,
            )
            .expect("write system FFmpeg frame");
        thread::sleep(Duration::from_millis(20));
    }
    process.finish().expect("finalize system FFmpeg");
    assert!(fs::metadata(&output).expect("MP4 metadata").len() > 0);
    let validation = Command::new(&capabilities.executable)
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(&output)
        .args(["-f", "null", "-"])
        .status()
        .expect("validate MP4 with FFmpeg");
    assert!(validation.success());
}
