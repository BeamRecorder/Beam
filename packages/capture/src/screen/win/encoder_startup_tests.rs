#![allow(clippy::expect_used)]
use super::{
    RecordingEncoder,
    tests::{crop, decode},
};
use crate::screen::{
    encoder_negotiation::{EncoderMode, EncoderStartFailure, negotiate_encoder},
    win::test_support::*,
};
use std::{
    path::Path,
    time::{Duration, Instant},
};

fn frames(mut encoder: RecordingEncoder, path: &Path, width: u32, height: u32) {
    let (_apartment, device, context) = device();
    let source = texture(&device, width, height);
    let pixels = (0..width * height)
        .flat_map(|pixel| {
            if pixel < width * (height / 2) {
                [240, 10, 10, 255]
            } else {
                [10, 10, 240, 255]
            }
        })
        .collect::<Vec<_>>();
    update(&context, &source, width, &pixels);
    for index in 0..12 {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !encoder
            .send_texture(
                &device,
                &context,
                &source,
                crop(width, height),
                index * 10_000_000 / 60,
            )
            .expect("submit actual GPU frame")
        {
            assert!(
                Instant::now() < deadline,
                "encoder must progress with a bounded queue"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    encoder.finish().expect("finalize recording");
    let (pixels, timestamps) = decode(path, "scale=16:16,");
    assert!(
        *timestamps.last().expect("last frame") >= 0.18,
        "PTS must retain recording duration: {timestamps:?}"
    );
    assert!(timestamps.windows(2).all(|pair| pair[0] <= pair[1]));
    assert!(
        timestamps[0].abs() < 0.001,
        "the first recorded image must survive encoder selection"
    );
    for image in pixels.as_chunks::<{ 16 * 16 * 4 }>().0 {
        assert!(image[0] > 200 && image[2] < 40, "top row must remain blue");
        let bottom = (15 * 16 + 8) * 4;
        assert!(
            image[bottom + 2] > 200 && image[bottom] < 40,
            "bottom row must remain red"
        );
    }
}

#[test]
fn reported_1466_by_1178_at_60_fps_produces_decodable_video() {
    let (_apartment, _, _) = device();
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("reported.mp4");
    let encoder = RecordingEncoder::new(&path, 1466, 1178, 15_000_000, 60)
        .expect("negotiate reported dimensions");
    frames(encoder, &path, 1466, 1178);
}

#[test]
fn software_transcoder_accepts_gpu_surfaces_at_reported_dimensions() {
    let (_apartment, _, _) = device();
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("software.mp4");
    let encoder = RecordingEncoder::with_mode(
        &path,
        1466,
        1178,
        15_000_000,
        60,
        Some(EncoderMode::Software),
    )
    .expect("Windows software H.264");
    frames(encoder, &path, 1466, 1178);
}

#[test]
fn rejected_accelerated_type_selects_a_real_software_encoder_and_keeps_first_image() {
    let (_apartment, _, _) = device();
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("negotiated.mp4");
    let mut modes = Vec::new();
    let encoder = negotiate_encoder(Instant::now() + Duration::from_secs(10), |mode| {
        modes.push(mode);
        if mode == EncoderMode::Accelerated {
            return Err(EncoderStartFailure::codec(
                "transcode",
                0xC00D6D60,
                "reported error",
            ));
        }
        RecordingEncoder::with_mode(&path, 1466, 1178, 15_000_000, 60, Some(mode))
            .map_err(EncoderStartFailure::terminal)
    })
    .expect("software selection");
    assert_eq!(modes, [EncoderMode::Accelerated, EncoderMode::Software]);
    frames(encoder, &path, 1466, 1178);
}

#[test]
fn repeated_software_starts_release_the_source_and_sample_worker() {
    let (_apartment, device, context) = device();
    let directory = tempfile::tempdir().expect("directory");
    let source = texture(&device, 64, 64);
    update(&context, &source, 64, &[150; 64 * 64 * 4]);
    for index in 0..16 {
        let path = directory.path().join(format!("software-{index}.mp4"));
        let mut encoder =
            RecordingEncoder::with_mode(&path, 64, 64, 1_000_000, 60, Some(EncoderMode::Software))
                .expect("no previous sample worker remains");
        assert!(
            encoder
                .send_texture(&device, &context, &source, crop(64, 64), 0)
                .expect("first frame")
        );
        encoder.finish().expect("software finalized");
        decode(&path, "");
    }
}
