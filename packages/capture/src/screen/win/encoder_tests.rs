#![allow(clippy::expect_used)]
use super::super::test_support::*;
use super::RecordingEncoder;
use crate::screen::PixelCrop;
use std::{
    path::Path,
    process::Command,
    time::{Duration, Instant},
};

fn crop(width: u32, height: u32) -> PixelCrop {
    PixelCrop {
        start_x: 0,
        start_y: 0,
        end_x: width,
        end_y: height,
    }
}

fn decode(path: &Path, filter: &str) -> (Vec<u8>, Vec<f64>) {
    let binary = std::env::var_os("BEAM_CAPTURE_TEST_FFMPEG").unwrap_or_else(|| "ffmpeg".into());
    let output = Command::new(binary)
        .args([
            "-hide_banner",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-i",
        ])
        .arg(path)
        .args([
            "-vf",
            &format!("{filter}showinfo"),
            "-fps_mode",
            "passthrough",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgra",
            "pipe:1",
        ])
        .output()
        .expect("FFmpeg is required to validate decoded Windows recordings");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "MP4 must decode successfully: {stderr}"
    );
    let timestamps = stderr
        .lines()
        .filter_map(|line| {
            line.split_once("pts_time:")
                .and_then(|(_, value)| value.split_whitespace().next())
                .and_then(|value| value.parse::<f64>().ok())
        })
        .collect::<Vec<_>>();
    assert!(
        !timestamps.is_empty(),
        "decoder must report real frame timestamps: {stderr}"
    );
    (output.stdout, timestamps)
}

fn encode(path: &Path) {
    let (_apartment, device, context) = device();
    let source = texture(&device, 64, 64);
    let mut encoder = RecordingEncoder::new(path, 64, 64, 1_000_000, 30).expect("H.264 encoder");
    let pixels = (0..4096)
        .flat_map(|pixel| {
            if pixel < 2048 {
                [240, 10, 10, 255]
            } else {
                [10, 10, 240, 255]
            }
        })
        .collect::<Vec<_>>();
    update(&context, &source, 64, &pixels);
    for frame in 0..30 {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if encoder
                .send_texture(&device, &context, &source, crop(64, 64), frame * 333_333)
                .expect("GPU sample")
            {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "encoder must consume its bounded queue"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    let started = Instant::now();
    encoder.finish().expect("finalize MP4");
    assert!(started.elapsed() < Duration::from_secs(15));
    let (pixels, timestamps) = decode(path, "");
    assert!(*timestamps.last().expect("last PTS") >= 0.9);
    assert_eq!(pixels.len() % (64 * 64 * 4), 0);
    for frame in pixels.as_chunks::<{ 64 * 64 * 4 }>().0 {
        assert!(frame[0] > 200 && frame[2] < 40, "top row must remain blue");
        let bottom = (63 * 64 + 32) * 4;
        assert!(
            frame[bottom + 2] > 200 && frame[bottom] < 40,
            "bottom row must remain red"
        );
    }
}

#[test]
fn real_gpu_encoder_mp4_decodes_with_correct_rows_and_timestamps() {
    let temporary = tempfile::tempdir().expect("directory");
    encode(&temporary.path().join("screen.mp4"));
}

#[test]
fn real_gpu_encoder_supports_unicode_and_spaces_in_output_paths() {
    let temporary = tempfile::tempdir().expect("directory");
    encode(&temporary.path().join("écran présentation.mp4"));
}

#[test]
fn repeated_native_encoder_sessions_release_workers_and_process_handles() {
    use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessHandleCount};
    let (_apartment, device, context) = device();
    let temporary = tempfile::tempdir().expect("directory");
    let source = texture(&device, 64, 64);
    update(&context, &source, 64, &[128; 64 * 64 * 4]);
    let mut baseline = None;
    for session in 0..64 {
        let path = temporary.path().join(format!("screen-{session}.mp4"));
        let mut encoder =
            RecordingEncoder::new(&path, 64, 64, 1_000_000, 30).expect("fresh encoder worker");
        assert!(
            encoder
                .send_texture(&device, &context, &source, crop(64, 64), 0)
                .expect("first frame")
        );
        encoder.finish().expect("worker and MP4 finalization");
        assert!(std::fs::metadata(&path).expect("media").len() > 0);
        let mut handles = 0;
        unsafe { GetProcessHandleCount(GetCurrentProcess(), &mut handles) }
            .expect("process handles");
        if session >= 4 {
            let initial = *baseline.get_or_insert(handles);
            assert!(
                handles <= initial + 32,
                "encoder sessions leaked native handles: {initial} -> {handles}"
            );
        }
        if session == 63 {
            decode(&path, "");
        }
    }
}

#[test]
fn a_single_static_frame_remains_visible_until_stop() {
    let (_apartment, device, context) = device();
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("static.mp4");
    let source = texture(&device, 64, 64);
    update(&context, &source, 64, &[190; 64 * 64 * 4]);
    let mut encoder = RecordingEncoder::new(&path, 64, 64, 1_000_000, 30).expect("encoder");
    assert!(
        encoder
            .send_texture(&device, &context, &source, crop(64, 64), 0)
            .expect("first and only native frame")
    );
    update(&context, &source, 64, &[0; 64 * 64 * 4]);
    std::thread::sleep(Duration::from_millis(1200));
    encoder.finish().expect("final static interval");
    let (pixels, timestamps) = decode(&path, "");
    assert!(
        *timestamps.last().expect("final timestamp") >= 1.1,
        "static video must reach Stop, got {timestamps:?}"
    );
    assert!(
        pixels
            .as_chunks::<4>()
            .0
            .iter()
            .all(|pixel| pixel[0].abs_diff(190) < 10
                && pixel[1].abs_diff(190) < 10
                && pixel[2].abs_diff(190) < 10)
    );
}

#[test]
fn burst_pressure_and_source_reuse_produce_a_decodable_bounded_video() {
    let (_apartment, device, context) = device();
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("pressure.mp4");
    let source = texture(&device, 1920, 1080);
    update(&context, &source, 1920, &vec![128; 1920 * 1080 * 4]);
    let mut encoder = RecordingEncoder::new(&path, 1920, 1080, 8_000_000, 30).expect("encoder");
    let mut accepted = 0;
    let mut dropped = 0;
    for frame in 0..20_000 {
        if encoder
            .send_texture(&device, &context, &source, crop(1920, 1080), frame * 1000)
            .expect("bounded submission")
        {
            accepted += 1;
        } else {
            dropped += 1;
        }
    }
    assert!(
        accepted > 0 && dropped > 0,
        "both encoder progress and pressure must be exercised"
    );
    update(&context, &source, 1920, &vec![0; 1920 * 1080 * 4]);
    encoder.finish().expect("drain under pressure");
    let (pixels, timestamps) = decode(&path, "scale=16:16,");
    assert!(timestamps.windows(2).all(|pair| pair[1] >= pair[0]));
    assert!(
        pixels
            .as_chunks::<4>()
            .0
            .iter()
            .all(|pixel| pixel[0].abs_diff(128) < 10)
    );
}

#[test]
fn irregular_native_frame_times_survive_encoding_without_compressing_idle_time() {
    let (_apartment, device, context) = device();
    let temporary = tempfile::tempdir().expect("directory");
    let path = temporary.path().join("variable.mp4");
    let source = texture(&device, 64, 64);
    update(&context, &source, 64, &[80; 64 * 64 * 4]);
    let mut encoder = RecordingEncoder::new(&path, 64, 64, 1_000_000, 30).expect("encoder");
    for timestamp in [0, 1_000_000, 4_000_000, 12_000_000, 20_000_000, 35_000_000] {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !encoder
            .send_texture(&device, &context, &source, crop(64, 64), timestamp)
            .expect("native PTS")
        {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    encoder.finish().expect("finish");
    let (_, timestamps) = decode(&path, "");
    assert!(
        *timestamps.last().expect("last PTS") >= 3.45,
        "native gaps must survive, got {timestamps:?}"
    );
    assert!(timestamps.windows(2).all(|pair| pair[1] >= pair[0]));
}

#[test]
fn invalid_settings_and_existing_media_are_rejected_without_truncating_files() {
    let temporary = tempfile::tempdir().expect("directory");
    for (width, height, bitrate, fps) in [
        (0, 64, 1, 30),
        (64, 0, 1, 30),
        (63, 64, 1, 30),
        (64, 64, 0, 30),
        (64, 64, 1, 0),
    ] {
        let path = temporary.path().join("invalid.mp4");
        assert!(RecordingEncoder::new(&path, width, height, bitrate, fps).is_err());
        assert!(!path.exists());
    }
    let path = temporary.path().join("existing.mp4");
    std::fs::write(&path, b"existing recorded video").expect("media");
    assert!(RecordingEncoder::new(&path, 64, 64, 1_000_000, 30).is_err());
    assert_eq!(
        std::fs::read(path).expect("unchanged"),
        b"existing recorded video"
    );
}
