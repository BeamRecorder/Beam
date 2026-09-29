//! Hardware encodebin remains alive while source timelines are replaced.
use super::{
    segment_types::{Encoder, PipelineGuard},
    types::{Container, VideoEncoder},
};
use crate::{Project, Result, video::pipeline::media};
use gst::prelude::*;

pub(crate) fn build(
    project: &Project,
    path: &std::path::Path,
    container: Container,
    encoder: VideoEncoder,
) -> Result<Encoder> {
    let audio = crate::video::pipeline::has_audio(project);
    let profile = super::profile::for_canvas(container, encoder, audio, &project.canvas)?;
    let pipeline = gst::Pipeline::new();
    pipeline.set_context(crate::video::gpu::display_context());
    let encode = gst::ElementFactory::make("encodebin2")
        .name("beam_export_encoder")
        .build()
        .map_err(media)?;
    encode.set_property("profile", profile);
    encode.set_property_from_str("flags", "no-video-conversion");
    encode.set_properties(&[
        ("queue-buffers-max", &2_u32),
        ("queue-bytes-max", &0_u32),
        ("queue-time-max", &0_u64),
    ]);
    let output = gst::ElementFactory::make("filesink")
        .property(
            "location",
            path.to_str()
                .ok_or_else(|| media("export path is not UTF-8"))?,
        )
        .build()
        .map_err(media)?;
    pipeline.add_many([&encode, &output]).map_err(media)?;
    let sink = output
        .static_pad("sink")
        .ok_or_else(|| media("export destination has no input"))?;
    encode.connect_pad_added(move |encode, pad| {
        if pad.direction() == gst::PadDirection::Src
            && !sink.is_linked()
            && let Err(error) = pad.link(&sink)
        {
            gst::element_error!(
                encode,
                gst::CoreError::Negotiation,
                ("muxer output link failed: {error}")
            );
        }
    });
    for pad in encode.src_pads() {
        if let Some(sink) = output.static_pad("sink")
            && !sink.is_linked()
        {
            pad.link(&sink).map_err(media)?;
        }
    }
    let video = source(
        "beam_export_video",
        &gst::Caps::builder("video/x-raw")
            .features(["memory:GLMemory"])
            .field("format", "RGBA")
            .field("texture-target", "2D")
            .field("width", project.canvas.width as i32)
            .field("height", project.canvas.height as i32)
            .field(
                "framerate",
                gst::Fraction::new(
                    project.canvas.fps as i32,
                    project.canvas.fps_denominator as i32,
                ),
            )
            .field("pixel-aspect-ratio", gst::Fraction::new(1, 1))
            .build(),
    )?;
    video.set_max_buffers(2);
    let filter =
        gst::parse::bin_from_description(super::gpu::description(encoder), true).map_err(media)?;
    pipeline
        .add_many([video.upcast_ref::<gst::Element>(), filter.upcast_ref()])
        .map_err(media)?;
    video.link(&filter).map_err(media)?;
    link_input(filter.upcast_ref(), &encode, "video_%u")?;
    let audio = if audio {
        let audio = source(
            "beam_export_audio",
            &"audio/x-raw,format=F32LE,rate=48000,channels=2,layout=interleaved"
                .parse::<gst::Caps>()
                .map_err(media)?,
        )?;
        audio.set_max_time(gst::ClockTime::from_mseconds(200));
        pipeline.add(&audio).map_err(media)?;
        link_input(audio.upcast_ref(), &encode, "audio_%u")?;
        Some(audio)
    } else {
        None
    };
    Ok(Encoder {
        _guard: PipelineGuard(pipeline.clone(), None),
        pipeline,
        video,
        audio,
        context: None,
    })
}
fn source(name: &str, caps: &gst::Caps) -> Result<gst_app::AppSrc> {
    let source = gst::ElementFactory::make("appsrc")
        .name(name)
        .build()
        .map_err(media)?
        .downcast::<gst_app::AppSrc>()
        .map_err(|_| media("invalid raw encoder source"))?;
    source.set_caps(Some(caps));
    source.set_format(gst::Format::Time);
    source.set_block(true);
    source.set_max_bytes(0);
    Ok(source)
}
fn link_input(input: &gst::Element, encode: &gst::Element, template: &str) -> Result<()> {
    let prefix = template.trim_end_matches("%u");
    let sink = encode
        .sink_pads()
        .into_iter()
        .find(|pad| pad.name().starts_with(prefix) && !pad.is_linked())
        .or_else(|| encode.request_pad_simple(template))
        .ok_or_else(|| {
            media(format!(
                "hardware encoder refused {template}; configured inputs: {:?}",
                encode
                    .sink_pads()
                    .iter()
                    .map(|pad| pad.name())
                    .collect::<Vec<_>>()
            ))
        })?;
    input
        .static_pad("src")
        .ok_or_else(|| media("raw stream has no output"))?
        .link(&sink)
        .map_err(media)?;
    Ok(())
}

pub(crate) fn share_context(
    encoder: &mut Encoder,
    producer: &ges::Pipeline,
    sample: &gst::Sample,
) -> Result<()> {
    if encoder.context.is_none() {
        let buffer = sample
            .buffer()
            .ok_or_else(|| media("source preroll has no video buffer"))?;
        let gl = buffer
            .peek_memory(0)
            .downcast_memory_ref::<gst_gl::GLMemory>()
            .ok_or_else(|| media("segmented export requires GLMemory from composition"))?;
        let mut context = gst::Context::new("gst.gl.app_context", true);
        context
            .get_mut()
            .ok_or_else(|| media("unable to initialize export GL context"))?
            .structure_mut()
            .set("context", gl.context());
        encoder.pipeline.set_context(&context);
        producer.set_context(&context);
        encoder.context = Some(context);
    }
    Ok(())
}
