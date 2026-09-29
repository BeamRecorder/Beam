#![allow(clippy::expect_used)]
#[path = "../src/video.rs"]
mod video;
pub use beam_media_encode::{EncodeError, VideoConfig, VideoEncoding};
use gst::prelude::*;

#[test]
fn native_vp9_keeps_full_chroma_and_wins_over_software() {
    let encoding = video::select_with(|_, _| true).expect("profile");
    assert_eq!(encoding.factory, "vavp9enc");
    assert_eq!(encoding.pixel_format, "VUYA");
    assert_eq!(encoding.codec, "vp9");
}
#[test]
fn selection_respects_device_format_support_and_missing_plugins() {
    assert_eq!(
        video::select_with(|name, _| name == "qsvvp9enc")
            .expect("qsv")
            .codec,
        "vp9"
    );
    assert_eq!(
        video::select_with(|name, _| name == "vp8enc")
            .expect("software")
            .codec,
        "vp8"
    );
    assert!(video::select_with(|_, _| false).is_none());
}
#[test]
fn bitrate_scales_with_resolution_and_cadence_without_overflow() {
    let config = VideoConfig {
        width: 1920,
        height: 1080,
        fps: 30,
    };
    assert_eq!(video::bitrate(config), 11_197_440);
    assert_eq!(
        video::bitrate(VideoConfig { fps: 60, ..config }),
        22_394_880
    );
    assert_eq!(
        video::bitrate(VideoConfig {
            width: 1,
            height: 1,
            fps: 1
        }),
        1_000_000
    );
    assert_eq!(
        video::bitrate(VideoConfig {
            width: u32::MAX,
            height: u32::MAX,
            fps: u32::MAX
        }),
        i32::MAX
    );
}
#[test]
fn software_profile_enforces_quality_and_disables_spatial_and_temporal_resampling() {
    gst::init().expect("GStreamer");
    let config = VideoConfig {
        width: 1920,
        height: 1080,
        fps: 30,
    };
    let profile = video::select_with(|name, _| name == "vp8enc").expect("VP8");
    let encoder = gst::ElementFactory::make(profile.factory)
        .build()
        .expect("VP8 encoder");
    video::configure(&encoder, config, profile).expect("profile");
    assert!((encoder.property::<i32>("target-bitrate") - 11_197_440).abs() < 1000);
    assert_eq!(encoder.property::<i32>("max-quantizer"), 24);
    assert!(!encoder.property::<bool>("resize-allowed"));
    assert_eq!(encoder.property::<i32>("dropframe-threshold"), 0);
    assert!(
        video::configure(
            &encoder,
            config,
            VideoEncoding {
                factory: "unknown",
                ..profile
            }
        )
        .is_err()
    );
}
#[test]
fn caps_selection_rejects_formats_without_a_matching_encoder() {
    gst::init().expect("GStreamer");
    assert!(
        video::select(VideoConfig {
            width: 16,
            height: 16,
            fps: 30
        })
        .is_ok()
    );
    assert!(
        video::select(VideoConfig {
            width: 65_536,
            height: 65_536,
            fps: 30
        })
        .is_err()
    );
}

#[test]
#[ignore = "requires Intel VA VP9 hardware; creates no GUI"]
fn hardware_profile_encodes_native_dimensions_and_records_actual_codec() {
    use beam_media_core::VideoFrame;
    use beam_media_encode::{QueueLimits, TrackWriter};
    let directory = tempfile::tempdir().expect("hardware media");
    let path = directory.path().join("hardware.webm");
    let config = VideoConfig {
        width: 1920,
        height: 1080,
        fps: 30,
    };
    let writer = TrackWriter::open_video(
        &path,
        config,
        QueueLimits {
            packets: 32,
            bytes: 128 * 1024 * 1024,
        },
    )
    .expect("hardware media");
    assert_eq!(
        writer.video_encoding().expect("hardware media").factory,
        "vavp9enc"
    );
    assert_eq!(
        writer
            .video_encoding()
            .expect("hardware media")
            .pixel_format,
        "VUYA"
    );
    for index in 0..12 {
        let mut data = vec![0; config.rgba_bytes().expect("hardware media")];
        for (position, pixel) in data.as_chunks_mut::<4>().0.iter_mut().enumerate() {
            pixel.copy_from_slice(&[
                if (position + index) % 31 < 3 { 240 } else { 30 },
                80,
                120,
                255,
            ]);
        }
        writer
            .push_video(
                VideoFrame {
                    captured_ns: index as u64 * 33_333_333,
                    width: config.width,
                    height: config.height,
                    data,
                },
                33_333_333,
            )
            .expect("hardware media");
    }
    assert_eq!(writer.accepted_packet_count(), 12);
    writer.finish().expect("hardware media");
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-count_frames",
            "-show_entries",
            "stream=codec_name,width,height,pix_fmt,nb_read_frames",
            "-of",
            "default=noprint_wrappers=1",
        ])
        .arg(path)
        .output()
        .expect("hardware media");
    assert!(output.status.success());
    let stream = String::from_utf8(output.stdout).expect("ffprobe output");
    for value in [
        "codec_name=vp9",
        "pix_fmt=yuv444p",
        "width=1920",
        "height=1080",
        "nb_read_frames=12",
    ] {
        assert!(
            stream.lines().any(|line| line == value),
            "missing {value}: {stream}"
        );
    }
}
