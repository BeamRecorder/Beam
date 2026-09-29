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
    input_for_caps(&sink_caps(encoder))
}
fn sink_caps(encoder: VideoEncoder) -> gst::Caps {
    gst::ElementFactory::find(encoder.factory)
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
        .unwrap_or_else(gst::Caps::new_empty)
}
/// Preserve document dimensions. Encoder minima must never silently resize the artwork.
pub fn for_canvas(
    container: Container,
    encoder: VideoEncoder,
    audio: bool,
    canvas: &crate::Canvas,
) -> Result<gst_pbutils::EncodingContainerProfile> {
    if canvas.width == 0 || canvas.height == 0 || canvas.fps == 0 || canvas.fps_denominator == 0 {
        return Err(media(
            "canvas dimensions and frame-rate fraction must be positive",
        ));
    }
    let factory = gst::ElementFactory::find(encoder.factory)
        .filter(|factory| {
            factory
                .metadata("klass")
                .is_some_and(|kind| kind.contains("Hardware"))
        })
        .ok_or_else(|| {
            media(format!(
                "{} is not an available hardware video encoder",
                encoder.factory
            ))
        })?;
    // A caller may supply a validated explicit factory without invoking selection.
    // Encodebin captures ranked candidates when it is constructed.
    factory.set_rank(factory.rank().max(gst::Rank::MARGINAL));
    let mut raw = input(encoder);
    let checked = |value: u32| {
        i32::try_from(value).map_err(|_| media("canvas exceeds the hardware caps integer budget"))
    };
    let structure = raw
        .make_mut()
        .structure_mut(0)
        .ok_or_else(|| media("missing encoder raw input contract"))?;
    structure.set("width", checked(canvas.width)?);
    structure.set("height", checked(canvas.height)?);
    structure.set(
        "framerate",
        gst::Fraction::new(checked(canvas.fps)?, checked(canvas.fps_denominator)?),
    );
    structure.set("pixel-aspect-ratio", gst::Fraction::new(1, 1));
    let supported = sink_caps(encoder);
    if !raw.can_intersect(&supported) {
        return Err(media(format!(
            "hardware encoder {} cannot encode canvas {}x{} at {}/{} fps; supported raw input: {}",
            encoder.factory,
            canvas.width,
            canvas.height,
            canvas.fps,
            canvas.fps_denominator,
            supported
        )));
    }
    with_raw(container, encoder, audio, raw)
}
pub fn build(
    container: Container,
    encoder: VideoEncoder,
    audio: bool,
) -> Result<gst_pbutils::EncodingContainerProfile> {
    with_raw(container, encoder, audio, input(encoder))
}
fn with_raw(
    container: Container,
    encoder: VideoEncoder,
    audio: bool,
    raw: gst::Caps,
) -> Result<gst_pbutils::EncodingContainerProfile> {
    let format = match container {
        Container::Mp4 => "video/quicktime,variant=iso",
        Container::Webm => "video/webm",
    };
    let caps = format.parse::<gst::Caps>().map_err(media)?;
    let mut builder = gst_pbutils::EncodingContainerProfile::builder(&caps)
        .name("Beam GPU")
        .add_profile(
            gst_pbutils::EncodingVideoProfile::builder(
                &encoder.caps.parse::<gst::Caps>().map_err(media)?,
            )
            .preset_name(encoder.factory)
            // Intel VA VP9's deepest default reference hierarchy can fail in
            // vaEndPicture after hundreds of frames. Two references and four-
            // frame groups retain inter prediction and the normal 60-frame GOP.
            .element_properties_if_some((encoder.factory == "vavp9enc").then(|| {
                gst_pbutils::ElementProperties::builder_general()
                    .field("ref-frames", 2_u32)
                    .field("gf-group-size", 4_u32)
                    .field("hierarchical-level", 2_u32)
                    .build()
            }))
            .restriction(&raw)
            // The composition already supplies every frame at its exact rational
            // clock. A second videorate inside encodebin duplicates a frame at EOS.
            .variable_framerate(true)
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
