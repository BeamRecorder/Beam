#![allow(clippy::expect_used)]
use super::{encoding_profile, set_ratios};
use windows::Media::MediaProperties::{MediaEncodingSubtypes, VideoEncodingProperties};

#[test]
fn screen_profile_has_explicit_h264_mp4_geometry_rate_and_no_audio() {
    let _apartment = super::super::RuntimeApartment::initialize().expect("WinRT");
    let profile = encoding_profile(1466, 1178, 15_000_000, 60).expect("screen profile");
    let video = profile.Video().expect("video");
    assert_eq!(
        video.Subtype().expect("codec"),
        MediaEncodingSubtypes::H264().expect("H.264")
    );
    assert_eq!(
        profile
            .Container()
            .expect("container")
            .Subtype()
            .expect("type"),
        MediaEncodingSubtypes::Mpeg4().expect("MP4")
    );
    assert!(profile.Audio().is_err(), "browser sidecars own audio");
    assert_eq!(video.Width().expect("width"), 1466);
    assert_eq!(video.Height().expect("height"), 1178);
    assert_eq!(video.Bitrate().expect("bitrate"), 15_000_000);
    assert_eq!(
        video
            .FrameRate()
            .expect("rate")
            .Numerator()
            .expect("numerator"),
        60
    );
    assert_eq!(
        video
            .FrameRate()
            .expect("rate")
            .Denominator()
            .expect("denominator"),
        1
    );
    assert_eq!(
        video
            .PixelAspectRatio()
            .expect("aspect")
            .Numerator()
            .expect("numerator"),
        1
    );
    assert_eq!(
        video
            .PixelAspectRatio()
            .expect("aspect")
            .Denominator()
            .expect("denominator"),
        1
    );
}

#[test]
fn profiles_retain_requested_screen_sizes_rates_and_bitrates() {
    let _apartment = super::super::RuntimeApartment::initialize().expect("WinRT");
    for (width, height) in [(64, 64), (1466, 1178), (1920, 1080), (3840, 2160)] {
        for fps in [24, 30, 60, 144] {
            for bitrate in [1_000_000, 15_000_000, 75_000_000] {
                let video = encoding_profile(width, height, bitrate, fps)
                    .expect("profile")
                    .Video()
                    .expect("video");
                assert_eq!(video.Width().expect("width"), width);
                assert_eq!(video.Height().expect("height"), height);
                assert_eq!(video.Bitrate().expect("bitrate"), bitrate);
                assert_eq!(
                    video.FrameRate().expect("rate").Numerator().expect("fps"),
                    fps
                );
            }
        }
    }
}

#[test]
fn screen_ratios_replace_previous_camera_like_rates_and_aspect_values() {
    let _apartment = super::super::RuntimeApartment::initialize().expect("WinRT");
    let video = VideoEncodingProperties::CreateH264().expect("properties");
    video
        .FrameRate()
        .expect("rate")
        .SetNumerator(30_000)
        .expect("numerator");
    video
        .FrameRate()
        .expect("rate")
        .SetDenominator(1001)
        .expect("denominator");
    video
        .PixelAspectRatio()
        .expect("aspect")
        .SetNumerator(4)
        .expect("numerator");
    video
        .PixelAspectRatio()
        .expect("aspect")
        .SetDenominator(3)
        .expect("denominator");
    for fps in [1, 30, 60, 144] {
        set_ratios(&video, fps).expect("explicit screen ratios");
        assert_eq!(
            video
                .FrameRate()
                .expect("rate")
                .Numerator()
                .expect("numerator"),
            fps
        );
        assert_eq!(
            video
                .FrameRate()
                .expect("rate")
                .Denominator()
                .expect("denominator"),
            1
        );
        assert_eq!(
            video
                .PixelAspectRatio()
                .expect("aspect")
                .Numerator()
                .expect("numerator"),
            1
        );
        assert_eq!(
            video
                .PixelAspectRatio()
                .expect("aspect")
                .Denominator()
                .expect("denominator"),
            1
        );
    }
}
