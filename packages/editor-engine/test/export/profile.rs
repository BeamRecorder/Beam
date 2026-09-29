use beam_editor_engine::export::{
    profile,
    types::{Container, VideoEncoder},
};
use gst_pbutils::prelude::*;
#[test]
fn only_hardware_candidates_are_accepted_and_h264_is_preferred_for_mp4() {
    let chosen = profile::select_with(Container::Mp4, |name| {
        ["x264enc", "vaav1enc", "vah264enc"].contains(&name)
    })
    .unwrap();
    assert_eq!(chosen.factory, "vah264enc");
    assert!(profile::select_with(Container::Mp4, |name| name == "x264enc").is_none());
    assert!(profile::select_with(Container::Webm, |name| name == "vp8enc").is_none());
}
#[test]
fn av1_mp4_and_vp9_webm_are_available_on_devices_without_h264() {
    assert_eq!(
        profile::select_with(Container::Mp4, |name| name == "vaav1enc")
            .unwrap()
            .codec,
        "AV1"
    );
    assert_eq!(
        profile::select_with(Container::Webm, |name| name == "qsvvp9enc")
            .unwrap()
            .codec,
        "VP9"
    );
    assert_eq!(
        profile::select_with(Container::Webm, |name| name == "nvav1enc")
            .unwrap()
            .codec,
        "AV1"
    );
    assert_eq!(
        profile::select_with(Container::Webm, |name| name == "vaapivp8enc")
            .unwrap()
            .codec,
        "VP8"
    );
    assert!(profile::select_with(Container::Webm, |_| false).is_none());
}
#[test]
fn video_profile_pins_the_hardware_factory_and_audio_is_only_added_when_present() {
    gst::init().unwrap();
    let encoder = VideoEncoder::new("AV1", "video/x-av1", "vaav1enc");
    let silent = profile::build(Container::Mp4, encoder, false).unwrap();
    assert_eq!(silent.profiles().len(), 1);
    assert_eq!(
        silent.profiles()[0].preset_name().as_deref(),
        Some("vaav1enc")
    );
    assert_eq!(
        silent.profiles()[0]
            .clone()
            .downcast::<gst_pbutils::EncodingVideoProfile>()
            .unwrap()
            .restriction()
            .unwrap()
            .structure(0)
            .unwrap()
            .get::<String>("format")
            .unwrap(),
        "NV12"
    );
    let audio = profile::build(Container::Webm, encoder, true).unwrap();
    assert_eq!(audio.profiles().len(), 2);
    assert_eq!(audio.format().structure(0).unwrap().name(), "video/webm");
}

#[test]
fn gpu_input_is_selected_only_when_the_encoder_advertises_gl_nv12() {
    gst::init().unwrap();
    for caps in [
        "video/x-raw(memory:GLMemory),format=NV12",
        "video/x-raw(memory:GLMemory),format={NV12,RGBA};video/x-raw,format=NV12",
    ] {
        let selected = profile::input_for_caps(&caps.parse().unwrap());
        assert!(selected.features(0).unwrap().contains("memory:GLMemory"));
    }
    for caps in [
        "ANY",
        "EMPTY",
        "video/x-raw,format=NV12",
        "video/x-raw(memory:GLMemory),format=RGBA",
        "video/x-raw(memory:D3D11Memory),format=NV12",
    ] {
        let selected = profile::input_for_caps(&caps.parse().unwrap());
        assert!(!selected.features(0).unwrap().contains("memory:GLMemory"));
        assert_eq!(
            selected
                .structure(0)
                .unwrap()
                .get::<String>("colorimetry")
                .unwrap(),
            "bt709"
        );
        assert_eq!(
            selected
                .structure(0)
                .unwrap()
                .get::<String>("format")
                .unwrap(),
            "NV12"
        );
    }
}

#[test]
fn va_vp9_profile_uses_inter_prediction_with_a_bounded_reference_hierarchy() {
    gst::init().unwrap();
    let profile = profile::build(
        Container::Webm,
        VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
        false,
    )
    .unwrap();
    let properties = profile.profiles()[0].element_properties().unwrap();
    assert_eq!(properties.get::<u32>("ref-frames").unwrap(), 2);
    assert_eq!(properties.get::<u32>("gf-group-size").unwrap(), 4);
    assert_eq!(properties.get::<u32>("hierarchical-level").unwrap(), 2);
    assert!(!properties.has_field("key-int-max"));
    let other = profile::build(
        Container::Webm,
        VideoEncoder::new("VP9", "video/x-vp9", "qsvvp9enc"),
        false,
    )
    .unwrap();
    assert!(other.profiles()[0].element_properties().is_none());
}

#[test]
fn invalid_canvas_rate_and_dimensions_are_explicit_profile_errors() {
    gst::init().unwrap();
    let encoder = VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc");
    for canvas in [
        beam_editor_engine::Canvas {
            fps_denominator: 0,
            ..Default::default()
        },
        beam_editor_engine::Canvas {
            width: 0,
            ..Default::default()
        },
        beam_editor_engine::Canvas {
            fps: u32::MAX,
            ..Default::default()
        },
    ] {
        assert!(profile::for_canvas(Container::Webm, encoder, false, &canvas).is_err());
    }
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "requires the VA VP9 hardware encoder; uses no GUI"]
fn va_vp9_rejects_64_square_and_pins_supported_canvas_and_fractional_rate() {
    gst::init().unwrap();
    let encoder = VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc");
    assert!(gst::ElementFactory::find(encoder.factory).is_some());
    let mut canvas = beam_editor_engine::Canvas {
        width: 64,
        height: 64,
        ..Default::default()
    };
    let error = profile::for_canvas(Container::Webm, encoder, false, &canvas)
        .unwrap_err()
        .to_string();
    assert!(
        error.contains("cannot encode canvas 64x64")
            && error.contains("128")
            && error.contains("96"),
        "{error}"
    );
    canvas.width = 128;
    canvas.height = 96;
    canvas.fps = 30_000;
    canvas.fps_denominator = 1001;
    let profile = profile::for_canvas(Container::Webm, encoder, false, &canvas).unwrap();
    let video = profile.profiles()[0]
        .clone()
        .downcast::<gst_pbutils::EncodingVideoProfile>()
        .unwrap();
    let raw = video.restriction().unwrap();
    let s = raw.structure(0).unwrap();
    assert_eq!(s.get::<i32>("width").unwrap(), 128);
    assert_eq!(s.get::<i32>("height").unwrap(), 96);
    assert_eq!(
        s.get::<gst::Fraction>("framerate").unwrap(),
        gst::Fraction::new(30_000, 1001)
    );
}
