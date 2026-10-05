#![allow(clippy::expect_used)]

use std::{
    path::Path,
    time::{Duration, Instant},
};
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};

use super::RecordingEncoder;

struct Apartment;
impl Apartment {
    fn initialize() -> Self {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.expect("initialize WinRT");
        Self
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn encode(output: &Path) {
    let _apartment = Apartment::initialize();
    let mut encoder = RecordingEncoder::new(output, 64, 64, 1_000_000, 30).expect("H.264 encoder");
    let mut pixels = vec![0_u8; 64 * 64 * 4];
    for frame in 0..30 {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !encoder.has_capacity().expect("encoder running") {
            assert!(
                Instant::now() < deadline,
                "encoder must consume queued frames"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        pixels.fill((frame * 7) as u8);
        assert!(
            encoder
                .send_frame_buffer(&pixels, frame * 333_333)
                .expect("video sample")
        );
    }
    let started = Instant::now();
    encoder.finish().expect("finalize MP4");
    assert!(started.elapsed() < Duration::from_secs(15));
    let bytes = std::fs::read(output).expect("completed MP4");
    assert!(bytes.len() > 100);
    assert_eq!(&bytes[4..8], b"ftyp");
}

#[test]
fn real_windows_encoder_finalizes_a_video_only_mp4() {
    let directory = tempfile::tempdir().expect("output directory");
    encode(&directory.path().join("screen.mp4"));
}

#[test]
fn real_windows_encoder_supports_unicode_and_spaces_in_output_paths() {
    let directory = tempfile::tempdir().expect("output directory");
    encode(&directory.path().join("écran présentation.mp4"));
}

#[test]
fn real_windows_encoder_drops_pressure_instead_of_buffering_a_capture_burst() {
    let _apartment = Apartment::initialize();
    let directory = tempfile::tempdir().expect("output directory");
    let output = directory.path().join("pressure.mp4");
    let mut encoder = RecordingEncoder::new(&output, 64, 64, 1_000_000, 30).expect("encoder");
    let bytes = vec![128; 64 * 64 * 4];
    let mut dropped = 0;
    let mut accepted = 0;
    for frame in 0..10_000 {
        if encoder.has_capacity().expect("encoder running") {
            if encoder
                .send_frame_buffer(&bytes, frame * 333_333)
                .expect("sample")
            {
                accepted += 1;
            } else {
                dropped += 1;
            }
        } else {
            dropped += 1;
        }
    }
    assert!(accepted > 0);
    assert!(dropped > 0);
    encoder.finish().expect("bounded queue drains and finishes");
    assert!(output.metadata().expect("MP4").len() > 100);
}
