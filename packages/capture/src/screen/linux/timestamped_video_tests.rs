#![allow(clippy::expect_used)]

use std::{fs, process::Command, sync::Arc, thread, time::Duration};

use super::*;
use crate::screen::linux::{
    FfmpegCapabilities, FfmpegEncoder,
    ffmpeg_process::{FfmpegProcess, FfmpegProcessConfig},
};
use crate::screen::{OwnedVideoFrame, PixelFormat};

#[test]
fn framing_keeps_zero_and_large_capture_times_without_pixel_copies() {
    for timestamp in [0, 400_123_000, 86_400_000_000_000, u64::MAX] {
        let header = frame_header(timestamp, 16).expect("frame header");
        assert_eq!(&header[..4], &[0x1f, 0x43, 0xb6, 0x75]);
        assert_eq!(&header[header.len() - 4..], &[0x81, 0, 0, 0x80]);
        let mut time = Vec::new();
        uint(&mut time, 0xe7, timestamp / 1_000);
        assert_eq!(&header[12..12 + time.len()], time);
        let cluster_length =
            u64::from_be_bytes(header[4..12].try_into().expect("cluster size")) & ((1 << 56) - 1);
        assert_eq!(cluster_length, (header.len() - 12 + 16) as u64);
    }
}

#[test]
fn framing_rejects_packet_size_overflow_before_writing_any_pixels() {
    assert!(frame_header(0, usize::MAX).is_err());
    assert!(frame_header(0, (1_usize << 56) - 1).is_err());
    assert!(frame_header(0, 0).is_ok());
}

#[test]
fn header_declares_bgra_and_nominal_cadence_without_using_a_wall_clock() {
    let header = stream_header(3072, 1862, 60);
    assert!(header.windows(14).any(|bytes| bytes == b"V_UNCOMPRESSED"));
    assert!(header.windows(4).any(|bytes| bytes == b"BGRA"));
    let mut duration = Vec::new();
    uint(&mut duration, 0x23e383, 16_666_666);
    assert!(
        header
            .windows(duration.len())
            .any(|bytes| bytes == duration)
    );
}

#[test]
#[ignore = "requires the system FFmpeg/ffprobe runtime"]
fn system_ffmpeg_retains_capture_pts_with_slow_writes_and_segment_offsets() {
    let _lock = crate::screen::linux::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary timestamp test");
    let encoders = Command::new("ffmpeg")
        .args(["-hide_banner", "-encoders"])
        .output()
        .expect("list system encoders");
    let list = String::from_utf8_lossy(&encoders.stdout);
    let encoder = ["libx264", "libopenh264"]
        .into_iter()
        .find(|name| {
            list.lines()
                .any(|line| line.split_whitespace().nth(1) == Some(*name))
        })
        .expect("a supported software H.264 encoder");
    let capabilities = FfmpegCapabilities {
        executable: "ffmpeg".into(),
        encoder: FfmpegEncoder::software(encoder),
    };
    let output = temporary.path().join("timestamped.mp4");
    let mut process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width: 64,
        height: 64,
        fps: 60,
        bitrate_bps: 500_000,
        keyframe_interval_seconds: 1,
    })
    .expect("start system FFmpeg");
    // Actual delivery pauses differ deliberately from the captured intervals.
    let expected = [400_000_000, 450_000_000, 800_000_000, 1_200_000_000];
    for (index, timestamp) in expected.into_iter().enumerate() {
        thread::sleep(Duration::from_millis(if index == 1 { 250 } else { 10 }));
        process
            .write_frame(
                &OwnedVideoFrame {
                    width: 64,
                    height: 64,
                    stride: 256,
                    pixel_format: PixelFormat::Bgra8,
                    pixels: Arc::from(vec![index as u8 * 40; 64 * 64 * 4]),
                },
                timestamp,
            )
            .expect("write captured frame");
    }
    process.finish().expect("finalize MP4");
    let probe = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "frame=pts_time",
            "-of",
            "json",
        ])
        .arg(&output)
        .output()
        .expect("probe encoded timestamps");
    assert!(
        probe.status.success(),
        "{}",
        String::from_utf8_lossy(&probe.stderr)
    );
    let data: serde_json::Value = serde_json::from_slice(&probe.stdout).expect("probe JSON");
    let frames = data["frames"].as_array().expect("frames");
    assert_eq!(frames.len(), expected.len());
    for (frame, timestamp) in frames.iter().zip(expected) {
        let actual = frame["pts_time"]
            .as_str()
            .expect("PTS")
            .parse::<f64>()
            .expect("numeric PTS");
        assert!(
            (actual - timestamp as f64 / 1e9).abs() < 0.017,
            "capture PTS {timestamp} became {actual}"
        );
    }
    assert!(fs::metadata(output).expect("published video").len() > 0);
}

#[test]
#[ignore = "requires the system FFmpeg/ffprobe runtime and selected recording encoder"]
fn system_ffmpeg_preserves_vfr_frame_order_across_idle_gaps() {
    let _lock = crate::screen::linux::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary VFR test");
    let capabilities = crate::screen::linux::probe_ffmpeg().expect("selected recording encoder");
    let output = temporary.path().join("variable-cadence.mp4");
    let mut process = FfmpegProcess::spawn(FfmpegProcessConfig {
        capabilities: &capabilities,
        output: &output,
        width: 1280,
        height: 720,
        fps: 60,
        bitrate_bps: 4_000_000,
        keyframe_interval_seconds: 1,
    })
    .expect("start selected encoder");
    // A desktop alternates quick changes with idle periods. Frame reordering
    // must not move the last images before a gap into the following activity.
    let ticks: [u64; 20] = [
        0, 1, 2, 61, 62, 63, 66, 67, 68, 69, 70, 150, 151, 152, 153, 154, 155, 156, 157, 158,
    ];
    for (index, tick) in ticks.into_iter().enumerate() {
        let shade = index as u8 * 10;
        process
            .write_frame(
                &OwnedVideoFrame {
                    width: 1280,
                    height: 720,
                    stride: 1280 * 4,
                    pixel_format: PixelFormat::Bgra8,
                    pixels: Arc::from([shade, shade, shade, 255].repeat(1280 * 720)),
                },
                tick * 1_000_000_000 / 60,
            )
            .expect("write VFR frame");
    }
    process.finish().expect("finalize VFR recording");
    let probe = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "frame=pts_time",
            "-of",
            "json",
        ])
        .arg(&output)
        .output()
        .expect("probe VFR presentation times");
    assert!(probe.status.success());
    let data: serde_json::Value = serde_json::from_slice(&probe.stdout).expect("probe JSON");
    let frames = data["frames"].as_array().expect("VFR frames");
    assert_eq!(frames.len(), ticks.len());
    for (frame, tick) in frames.iter().zip(ticks) {
        let actual = frame["pts_time"]
            .as_str()
            .expect("frame PTS")
            .parse::<f64>()
            .expect("numeric PTS");
        let expected = tick as f64 / 60.0;
        assert!(
            (actual - expected).abs() < 0.017,
            "{} moved frame from {expected} to {actual}",
            capabilities.encoder.name,
        );
    }
    let decoded = Command::new(&capabilities.executable)
        .args(["-v", "error", "-i"])
        .arg(output)
        .args([
            "-vf",
            "crop=2:2:640:360",
            "-fps_mode",
            "passthrough",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ])
        .output()
        .expect("decode VFR frame colors");
    assert!(decoded.status.success());
    assert_eq!(decoded.stdout.len(), ticks.len() * 12);
    for (index, frame) in decoded.stdout.as_chunks::<12>().0.iter().enumerate() {
        let expected = index as i16 * 10;
        assert!(
            frame
                .iter()
                .all(|value| (i16::from(*value) - expected).abs() < 5)
        );
    }
}
