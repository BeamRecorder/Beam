#![allow(clippy::expect_used)]

use std::{fs, os::unix::fs::PermissionsExt, path::Path, sync::Arc};

use crate::screen::{OwnedVideoFrame, PixelFormat};

use super::{
    FfmpegCapabilities,
    ffmpeg_process::{FfmpegProcess, FfmpegProcessConfig, arguments, partial_path},
};

fn capabilities() -> FfmpegCapabilities {
    FfmpegCapabilities {
        executable: "ffmpeg".into(),
        encoder: "libopenh264".into(),
    }
}

#[test]
fn arguments_describe_bgra_vfr_h264_mp4_input() {
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
    assert!(
        values
            .windows(2)
            .any(|pair| pair == ["-pixel_format", "bgra"])
    );
    assert!(
        values
            .windows(2)
            .any(|pair| pair == ["-video_size", "1919x1079"])
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
    fs::write(&executable, script).expect("write fake FFmpeg");
    let mut permissions = fs::metadata(&executable)
        .expect("fake metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&executable, permissions).expect("make fake executable");
    (
        directory,
        FfmpegCapabilities {
            executable,
            encoder: "libopenh264".into(),
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
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\nbytes=$(wc -c)\n[ \"$bytes\" -eq 16 ] || exit 9\nprintf 'fake-mp4' > \"$output\"\n",
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
        .write_frame(&frame(
            12,
            vec![
                1, 2, 3, 4, 5, 6, 7, 8, 90, 90, 90, 90, 9, 10, 11, 12, 13, 14, 15, 16, 80, 80, 80,
                80,
            ],
        ))
        .expect("write padded frame");
    process.finish().expect("finalize fake FFmpeg");
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
        .write_frame(&frame(8, vec![0; 16]))
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
#[ignore = "requires the system FFmpeg runtime"]
fn system_ffmpeg_encodes_a_playable_mp4_segment() {
    let capabilities = super::probe_ffmpeg().expect("system FFmpeg capabilities");
    let output_directory = tempfile::tempdir().expect("temporary output");
    let output = output_directory.path().join("segment-0001.mp4");
    let mut process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width: 32,
        height: 32,
        fps: 30,
        bitrate_bps: 500_000,
        keyframe_interval_seconds: 1,
    })
    .expect("spawn system FFmpeg");
    for shade in [0_u8, 32, 64, 96] {
        process
            .write_frame(&OwnedVideoFrame {
                width: 32,
                height: 32,
                stride: 128,
                pixel_format: PixelFormat::Bgra8,
                pixels: Arc::from(vec![shade; 32 * 32 * 4]),
            })
            .expect("write system FFmpeg frame");
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    process.finish().expect("finalize system FFmpeg");
    assert!(fs::metadata(&output).expect("MP4 metadata").len() > 0);
    let validation = std::process::Command::new(&capabilities.executable)
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(&output)
        .args(["-f", "null", "-"])
        .status()
        .expect("validate MP4 with FFmpeg");
    assert!(validation.success());
}
