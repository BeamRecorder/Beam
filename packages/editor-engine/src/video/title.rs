//! GES titles and opacity envelopes share the composition used by preview and export.
use super::pipeline::media;
use crate::{Canvas, Clip, Result, timeline::title_types::Title};
use ges::prelude::*;

/// Configures native Pango artwork at the output resolution and source coordinates.
pub(crate) fn configure(
    source: &ges::TrackElement,
    title: &Title,
    clip: &Clip,
    canvas: &Canvas,
) -> Result<()> {
    let font = format!(
        "{} {} {} {}px",
        title.font,
        if title.bold { "Bold" } else { "Regular" },
        if title.italic { "Italic" } else { "" },
        canvas.height as f64 * title.size / 100.
    );
    for (name, value) in [
        (
            "text",
            gst::glib::markup_escape_text(&title.text).to_value(),
        ),
        ("font-desc", font.to_value()),
        ("color", title.color.to_value()),
        ("draw-shadow", title.shadow.to_value()),
        ("shaded-background", title.background.to_value()),
        ("foreground-color", 0_u32.to_value()),
        ("xpos", clip.effects.x.to_value()),
        ("ypos", clip.effects.y.to_value()),
        ("halignment", ges::TextHAlign::Position.to_value()),
        ("valignment", ges::TextVAlign::Position.to_value()),
    ] {
        ges::prelude::TimelineElementExtManual::set_child_property(source, name, value)
            .map_err(media)?;
    }
    Ok(())
}

/// Source-time fades keep paused seeks, trims, and hardware exports deterministic.
pub(crate) fn fades(source: &ges::TrackElement, clip: &Clip, hidden: bool) -> Result<()> {
    envelope(
        source,
        clip,
        "alpha",
        if hidden { 0. } else { clip.effects.opacity },
    )
}

/// Audio transitions use the same source-time envelope, preserving lane mute and gain.
pub(crate) fn audio_fades(source: &ges::TrackElement, clip: &Clip, muted: bool) -> Result<()> {
    envelope(
        source,
        clip,
        "volume",
        if muted { 0. } else { clip.effects.volume },
    )
}

fn envelope(source: &ges::TrackElement, clip: &Clip, property: &str, opacity: f64) -> Result<()> {
    use gst_controller::prelude::*;
    if clip.effects.fade_in_ms == 0 && clip.effects.fade_out_ms == 0 {
        return Ok(());
    }
    let control = gst_controller::InterpolationControlSource::new();
    control.set_mode(gst_controller::InterpolationMode::Linear);
    let begin = clip.source_in_ms;
    let end = begin + clip.duration_ms;
    for (time, value) in [
        (
            begin,
            if clip.effects.fade_in_ms > 0 {
                0.
            } else {
                opacity
            },
        ),
        (begin + clip.effects.fade_in_ms, opacity),
        (end - clip.effects.fade_out_ms, opacity),
        (
            end,
            if clip.effects.fade_out_ms > 0 {
                0.
            } else {
                opacity
            },
        ),
    ] {
        if !control.set(gst::ClockTime::from_mseconds(time), value) {
            return Err(media("could not create opacity envelope"));
        }
    }
    if !source.set_control_source(&control, property, "direct-absolute") {
        return Err(media("could not bind opacity envelope"));
    }
    Ok(())
}
