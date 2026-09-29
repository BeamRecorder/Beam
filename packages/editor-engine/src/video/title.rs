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
    raster_size(source, canvas)?;
    for (name, value) in properties(title, clip, canvas) {
        ges::prelude::TimelineElementExtManual::set_child_property(source, name, value)
            .map_err(media)?;
    }
    Ok(())
}

/// GES places its default 320×240 videotestsrc directly before Pango. Caps after
/// the text overlay resize artwork, and cannot make normalized text positions
/// refer to the canvas. Pin the raster dimensions before glyphs are generated.
fn raster_size(source: &ges::TrackElement, canvas: &Canvas) -> Result<()> {
    let element = source
        .element()
        .and_then(|e| e.downcast::<gst::Bin>().ok())
        .ok_or_else(|| media("native title source has no bin"))?;
    let background = element
        .iterate_recurse()
        .into_iter()
        .flatten()
        .find(|e| e.factory().is_some_and(|f| f.name() == "videotestsrc"))
        .ok_or_else(|| media("native title has no raster background"))?;
    let parent = background
        .parent()
        .and_then(|p| p.downcast::<gst::Bin>().ok())
        .ok_or_else(|| media("title raster background has no parent"))?;
    let before = background
        .static_pad("src")
        .ok_or_else(|| media("title raster has no output"))?;
    let after = before
        .peer()
        .ok_or_else(|| media("title raster is not linked to Pango"))?;
    let caps = gst::Caps::builder("video/x-raw")
        .field("format", "RGBA")
        .field("width", i32::try_from(canvas.width).map_err(media)?)
        .field("height", i32::try_from(canvas.height).map_err(media)?)
        .field(
            "framerate",
            gst::Fraction::new(
                i32::try_from(canvas.fps).map_err(media)?,
                i32::try_from(canvas.fps_denominator).map_err(media)?,
            ),
        )
        .field("pixel-aspect-ratio", gst::Fraction::new(1, 1))
        .build();
    let filter = gst::ElementFactory::make("capsfilter")
        .name("beam_title_raster")
        .property("caps", caps)
        .build()
        .map_err(media)?;
    before.unlink(&after).map_err(media)?;
    parent.add(&filter).map_err(media)?;
    before
        .link(
            &filter
                .static_pad("sink")
                .ok_or_else(|| media("title raster filter has no input"))?,
        )
        .map_err(media)?;
    filter
        .static_pad("src")
        .ok_or_else(|| media("title raster filter has no output"))?
        .link(&after)
        .map_err(media)?;
    Ok(())
}
pub(crate) fn properties(
    title: &Title,
    clip: &Clip,
    canvas: &Canvas,
) -> Vec<(&'static str, gst::glib::Value)> {
    let font = format!(
        "{} {} {} {}px",
        title.font,
        if title.bold { "Bold" } else { "Regular" },
        if title.italic { "Italic" } else { "" },
        canvas.height as f64 * title.size / 100.
    );
    vec![
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
    ]
}
