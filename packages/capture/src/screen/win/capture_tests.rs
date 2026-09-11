#![allow(clippy::expect_used)]

use super::flip_bgra_rows;
use crate::model::ScreenRegion;
use crate::screen::normalize_crop;

#[test]
fn flips_bgra_rows_from_top_to_bottom() {
    let source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    assert_eq!(
        flip_bgra_rows(&source, 2, 2),
        [9, 10, 11, 12, 13, 14, 15, 16, 1, 2, 3, 4, 5, 6, 7, 8]
    );
}

#[test]
fn normalized_dimensions_are_the_row_dimensions_used_for_bgra_conversion() {
    let crop = normalize_crop(
        ScreenRegion {
            x: 0.1,
            y: 0.1,
            width: 0.3,
            height: 0.4,
        },
        10,
        10,
    )
    .expect("valid crop");
    let source = [
        1, 2, 3, 4, 5, 6, 7, 8, // row 0
        9, 10, 11, 12, 13, 14, 15, 16, // row 1
        17, 18, 19, 20, 21, 22, 23, 24, // row 2
        25, 26, 27, 28, 29, 30, 31, 32, // row 3
    ];
    assert_eq!(
        flip_bgra_rows(&source, crop.width(), crop.height()),
        [
            25, 26, 27, 28, 29, 30, 31, 32, // row 3
            17, 18, 19, 20, 21, 22, 23, 24, // row 2
            9, 10, 11, 12, 13, 14, 15, 16, // row 1
            1, 2, 3, 4, 5, 6, 7, 8, // row 0
        ]
    );
}

fn pending_handler(region: Option<ScreenRegion>) -> super::CaptureHandler {
    super::CaptureHandler::from_flags(super::HandlerFlags {
        output: "unused-test-output.mp4".into(),
        bitrate: 8_000_000,
        fps: 30,
        metrics: Default::default(),
        start_gate: std::sync::Arc::new(crate::session::StartGate::new()),
        region,
        unavailable: Default::default(),
    })
}

#[test]
fn full_capture_waits_for_a_real_frame_before_creating_encoder_or_format() {
    let handler = pending_handler(None);
    assert!(handler.encoder.is_none());
    assert!(handler.encoded_size.is_none());
    let settings = handler.pending_encoder.expect("pending encoder settings");
    assert_eq!(settings.bitrate, 8_000_000);
    assert_eq!(settings.fps, 30);
    assert!(settings.candidate_crop_size.is_none());
}

#[test]
fn region_capture_starts_without_a_catalog_size_candidate() {
    let handler = pending_handler(Some(ScreenRegion {
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.5,
    }));
    assert!(handler.encoder.is_none());
    assert!(handler.crop.is_none());
    assert!(handler.encoded_size.is_none());
    assert!(
        handler
            .pending_encoder
            .expect("pending settings")
            .candidate_crop_size
            .is_none()
    );
}

#[test]
fn finishing_before_first_frame_discards_settings_without_creating_encoder() {
    let mut handler = pending_handler(None);
    handler.finish().expect("finish without frames");
    handler.finish().expect("idempotent finish");
    assert!(handler.pending_encoder.is_none());
    assert!(handler.encoder.is_none());
    assert!(handler.encoded_size.is_none());
}
