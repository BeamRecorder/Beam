//! Native tracks keep the canvas contract at every compositional boundary.
use crate::{Project, Result, video::pipeline::media};
use ges::prelude::*;

fn frame_rate(project: &Project) -> Result<gst::Fraction> {
    Ok(gst::Fraction::new(
        i32::try_from(project.canvas.fps)
            .map_err(|_| media("frame-rate numerator exceeds native budget"))?,
        i32::try_from(project.canvas.fps_denominator)
            .map_err(|_| media("frame-rate denominator exceeds native budget"))?,
    ))
}

pub(crate) fn new(
    project: &Project,
    streams: ges::TrackType,
    mixing: bool,
) -> Result<ges::Timeline> {
    let timeline = ges::Timeline::new();
    if streams.contains(ges::TrackType::VIDEO) {
        let track = ges::VideoTrack::new();
        track.set_mixing(mixing);
        track.set_restriction_caps(
            &gst::Caps::builder("video/x-raw")
                .features(["memory:GLMemory"])
                .field("format", "RGBA")
                .field("texture-target", "2D")
                .field("width", project.canvas.width as i32)
                .field("height", project.canvas.height as i32)
                .field("framerate", frame_rate(project)?)
                .field("pixel-aspect-ratio", gst::Fraction::new(1, 1))
                .build(),
        );
        timeline.add_track(&track).map_err(media)?;
    }
    if streams.contains(ges::TrackType::AUDIO) {
        let track = ges::AudioTrack::new();
        track.set_mixing(mixing);
        track.set_restriction_caps(
            &"audio/x-raw,format=F32LE,rate=48000,channels=2,layout=interleaved"
                .parse::<gst::Caps>()
                .map_err(media)?,
        );
        timeline.add_track(&track).map_err(media)?;
    }
    Ok(timeline)
}

pub(crate) fn background(timeline: &ges::Timeline, project: &Project, color: u32) -> Result<()> {
    let clip = ges::TestClip::new().ok_or_else(|| media("GES cannot create canvas background"))?;
    clip.set_supported_formats(ges::TrackType::VIDEO);
    clip.set_vpattern(ges::VideoTestPattern::SolidColor);
    if !clip.set_duration(gst::ClockTime::from_mseconds(project.duration_ms())) {
        return Err(media("GES rejected canvas duration"));
    }
    timeline.append_layer().add_clip(&clip).map_err(media)?;
    clip.set_child_property("foreground-color", color.to_value())
        .map_err(media)?;
    for child in clip.children(false) {
        if let Ok(source) = child.downcast::<ges::TrackElement>()
            && source.is::<ges::VideoSource>()
        {
            super::gpu::source::configure(&source)?;
            geometry(&source, project)?;
        }
    }
    Ok(())
}

pub(crate) fn geometry(source: &ges::TrackElement, project: &Project) -> Result<()> {
    for (key, value) in [
        ("width", project.canvas.width as i32),
        ("height", project.canvas.height as i32),
        ("posx", 0),
        ("posy", 0),
    ] {
        ges::prelude::TimelineElementExtManual::set_child_property(source, key, value.to_value())
            .map_err(media)?;
    }
    Ok(())
}

/// Scope placeholders describe their real canvas before GES derives source caps.
pub(crate) fn source(project: &Project) -> Result<ges::TestClip> {
    let id = gst::Structure::builder("GESTestClip")
        .field("width", project.canvas.width as i32)
        .field("height", project.canvas.height as i32)
        .field("framerate", frame_rate(project)?)
        .build();
    ges::Asset::request::<ges::TestClip>(Some(&id.to_string()))
        .map_err(media)?
        .extract()
        .map_err(media)?
        .downcast::<ges::TestClip>()
        .map_err(|_| media("canvas scope did not create a native source"))
}

/// The native silence producer gives a lane a defined output through every gap.
pub(crate) fn silence(timeline: &ges::Timeline, project: &Project) -> Result<()> {
    let clip = ges::TestClip::new().ok_or_else(|| media("GES cannot create a lane gap source"))?;
    clip.set_supported_formats(ges::TrackType::AUDIO);
    clip.set_volume(0.);
    if !clip.set_duration(gst::ClockTime::from_mseconds(project.duration_ms())) {
        return Err(media("GES rejected lane duration"));
    }
    timeline.append_layer().add_clip(&clip).map_err(media)?;
    Ok(())
}
