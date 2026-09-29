//! Explicit hardware encoder selection; encodebin may not silently choose a CPU encoder.
use super::types::{Container, ExportEncoding, VideoEncoder};
use crate::{EditorError, Result, video::pipeline::media};
use gst::prelude::*;
use gst_pbutils::prelude::*;

const MP4: &[VideoEncoder] = &[
    VideoEncoder::new("H.264", "video/x-h264", "vah264enc"),
    VideoEncoder::new("H.264", "video/x-h264", "qsvh264enc"),
    VideoEncoder::new("H.264", "video/x-h264", "nvh264enc"),
    VideoEncoder::new("H.264", "video/x-h264", "nvd3d11h264enc"),
    VideoEncoder::new("H.264", "video/x-h264", "d3d12h264enc"),
    VideoEncoder::new("H.264", "video/x-h264", "amfh264enc"),
    VideoEncoder::new("H.264", "video/x-h264", "vtenc_h264_hw"),
    VideoEncoder::new("H.264", "video/x-h264", "vaapih264enc"),
    VideoEncoder::new("AV1", "video/x-av1", "vaav1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "qsvav1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "nvav1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "nvd3d11av1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "d3d12av1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "amfav1enc"),
];
const WEBM: &[VideoEncoder] = &[
    VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
    VideoEncoder::new("VP9", "video/x-vp9", "qsvvp9enc"),
    VideoEncoder::new("VP9", "video/x-vp9", "vaapivp9enc"),
    VideoEncoder::new("AV1", "video/x-av1", "vaav1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "qsvav1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "nvav1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "nvd3d11av1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "d3d12av1enc"),
    VideoEncoder::new("AV1", "video/x-av1", "amfav1enc"),
    VideoEncoder::new("VP8", "video/x-vp8", "vaapivp8enc"),
];

/// Pure selection policy also exercises missing-plugin paths without mutating the registry.
pub fn select_with(container: Container, available: impl Fn(&str) -> bool) -> Option<VideoEncoder> {
    let candidates = match container {
        Container::Mp4 => MP4,
        Container::Webm => WEBM,
    };
    candidates
        .iter()
        .find(|encoder| available(encoder.factory))
        .copied()
}
pub fn hardware(container: Container) -> Result<VideoEncoder> {
    gst::init().map_err(media)?;
    let encoder = select_with(container, |name| gst::ElementFactory::find(name).is_some_and(|factory|
        factory.metadata("klass").is_some_and(|klass| klass.contains("Hardware"))
    )).ok_or_else(|| EditorError::Media(format!(
        "no hardware {} video encoder is available; install the GStreamer plugin and GPU driver for your device",
        container.extension()
    )))?;
    // VA encoders are registered at rank NONE; encodebin caches factories at construction.
    // A pinned profile still requires its chosen encoder to reach encodebin's candidate list.
    if let Some(factory) = gst::ElementFactory::find(encoder.factory) {
        factory.set_rank(factory.rank().max(gst::Rank::MARGINAL));
    }
    Ok(encoder)
}
pub fn available() -> Vec<ExportEncoding> {
    [Container::Mp4, Container::Webm]
        .into_iter()
        .filter_map(|container| {
            hardware(container).ok().map(|encoder| ExportEncoding {
                container,
                codec: encoder.codec.into(),
                encoder: encoder.factory.into(),
            })
        })
        .collect()
}
/// Prefers the encoder's explicitly advertised GL NV12 input, preserving GPU memory.
/// Unknown/host-only caps retain NV12 compatibility without forcing another codec.
pub fn input_for_caps(sink: &gst::Caps) -> gst::Caps {
    let gl = "video/x-raw(memory:GLMemory),format=NV12,texture-target=2D,colorimetry=bt709"
        .parse::<gst::Caps>()
        .expect("static GL caps");
    if sink
        .iter_with_features()
        .any(|(_, features)| features.contains("memory:GLMemory"))
        && sink.can_intersect(&gl)
    {
        gl
    } else {
        gst::Caps::builder("video/x-raw")
            .field("format", "NV12")
            .field("colorimetry", "bt709")
            .build()
    }
}
/// Resolves the pinned encoder's raw memory contract before encodebin construction.
pub(crate) fn input(encoder: VideoEncoder) -> gst::Caps {
    let caps = gst::ElementFactory::find(encoder.factory)
        .map(|factory| {
            let mut caps = gst::Caps::new_empty();
            for template in factory
                .static_pad_templates()
                .iter()
                .filter(|template| template.direction() == gst::PadDirection::Sink)
            {
                caps.get_mut().unwrap().append(template.caps());
            }
            caps
        })
        .unwrap_or_else(gst::Caps::new_empty);
    input_for_caps(&caps)
}
pub fn build(
    container: Container,
    encoder: VideoEncoder,
    audio: bool,
) -> Result<gst_pbutils::EncodingContainerProfile> {
    let format = match container {
        Container::Mp4 => "video/quicktime,variant=iso",
        Container::Webm => "video/webm",
    };
    let raw = input(encoder);
    let caps = format.parse::<gst::Caps>().map_err(media)?;
    let mut builder = gst_pbutils::EncodingContainerProfile::builder(&caps)
        .name("Beam GPU")
        .add_profile(
            gst_pbutils::EncodingVideoProfile::builder(
                &encoder.caps.parse::<gst::Caps>().map_err(media)?,
            )
            .preset_name(encoder.factory)
            .restriction(&raw)
            .build(),
        );
    if audio {
        let format = match container {
            Container::Mp4 => "audio/mpeg,mpegversion=4",
            Container::Webm => "audio/x-vorbis",
        };
        builder = builder.add_profile(
            gst_pbutils::EncodingAudioProfile::builder(
                &format.parse::<gst::Caps>().map_err(media)?,
            )
            .build(),
        );
    }
    Ok(builder.build())
}
