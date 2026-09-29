//! One GES timeline contract for native preview and export.
use crate::{EditorError, Project, Result, TrackKind};
use ges::prelude::*;
use std::path::Path;

/// Builds a GES composition. Higher lanes paint above lower ones; audio is mixed by GES.
pub fn build(root: &Path, project: &Project) -> Result<ges::Pipeline> {
    crate::project::validation::project(project)?;
    super::gpu::initialize()?;
    let timeline = ges::Timeline::new();
    timeline.add_track(&ges::VideoTrack::new()).map_err(media)?;
    if has_audio(project) {
        timeline.add_track(&ges::AudioTrack::new()).map_err(media)?;
    }
    for track in timeline.tracks() {
        if track.track_type() == ges::TrackType::VIDEO {
            track.set_restriction_caps(
                &gst::Caps::builder("video/x-raw")
                    .features(["memory:GLMemory"])
                    .field("format", "RGBA")
                    .field("texture-target", "2D")
                    .field("width", project.canvas.width as i32)
                    .field("height", project.canvas.height as i32)
                    .field(
                        "framerate",
                        gst::Fraction::new(project.canvas.fps as i32, 1),
                    )
                    .field("pixel-aspect-ratio", gst::Fraction::new(1, 1))
                    .build(),
            );
        }
    }
    for lane in &project.tracks {
        let layer = timeline.append_layer();
        for clip in project.clips.iter().filter(|c| c.track_id == lane.id) {
            let asset = project.assets.iter().find(|a| a.id == clip.asset_id);
            let node: ges::Clip = if clip.title.is_some() {
                ges::TitleClip::new()
                    .ok_or_else(|| media("GES could not create a title"))?
                    .upcast()
            } else {
                let asset = asset.ok_or_else(|| EditorError::Invalid("missing source".into()))?;
                let path = crate::project::validation::source_path(root, &asset.path)?;
                let source = load_source(&super::probe::uri(&path)?)?
                    .extract()
                    .map_err(media)?
                    .downcast::<ges::UriClip>()
                    .map_err(|_| media("asset did not create a URI clip"))?;
                source.set_is_image(asset.is_image);
                source.upcast()
            };
            let formats = if lane.kind == TrackKind::Audio {
                ges::TrackType::AUDIO
            } else if asset.is_some_and(|asset| asset.has_audio) {
                ges::TrackType::VIDEO | ges::TrackType::AUDIO
            } else {
                ges::TrackType::VIDEO
            };
            node.set_supported_formats(formats);
            if !node.set_start(gst::ClockTime::from_mseconds(clip.start_ms))
                || !node.set_inpoint(gst::ClockTime::from_mseconds(clip.source_in_ms))
                || !node.set_duration(gst::ClockTime::from_mseconds(clip.duration_ms))
            {
                return Err(EditorError::Media("GES rejected clip timing".into()));
            }
            layer.add_clip(&node).map_err(media)?;
            if lane.kind == TrackKind::Video
                && (clip.effects.brightness != 0. || clip.effects.saturation != 1.)
            {
                let effect = ges::Effect::new(&format!(
                    "glupload name=beam_gpu_input ! glcolorbalance brightness={} saturation={} ! identity name=beam_gpu_output",
                    clip.effects.brightness, clip.effects.saturation
                ))
                .map_err(media)?;
                super::gpu::meta::preserve(&effect)?;
                node.add_top_effect(&effect, 0).map_err(media)?;
            }
            if lane.kind == TrackKind::Video
                && clip.effects.auto_zoom
                && let Some(asset) = asset.filter(|asset| !asset.zooms.is_empty())
            {
                node.add_top_effect(&super::gpu::camera::effect(asset)?, 0)
                    .map_err(media)?;
            }
            for child in node.children(false) {
                let Ok(element) = child.downcast::<ges::TrackElement>() else {
                    continue;
                };
                if element.is::<ges::VideoSource>() {
                    ges::prelude::TimelineElementExtManual::set_child_property(
                        &element,
                        "alpha",
                        (if lane.hidden {
                            0.
                        } else {
                            clip.effects.opacity
                        })
                        .to_value(),
                    )
                    .map_err(media)?;
                    super::gpu::source::configure(&element)?;
                    if let Some(title) = &clip.title {
                        super::title::configure(&element, title, clip, &project.canvas)?;
                    } else if let Some(asset) = asset {
                        super::preview::configure_geometry(&element, asset, clip, &project.canvas)?;
                    }
                    super::title::fades(&element, clip, lane.hidden)?;
                } else if element.is::<ges::AudioSource>() {
                    ges::prelude::TimelineElementExtManual::set_child_property(
                        &element,
                        "volume",
                        (if lane.muted { 0. } else { clip.effects.volume }).to_value(),
                    )
                    .map_err(media)?;
                    super::title::audio_fades(&element, clip, lane.muted)?;
                }
            }
        }
    }
    if project.duration_ms() > 0 {
        let background = ges::TestClip::new()
            .ok_or_else(|| EditorError::Media("GES cannot create the canvas background".into()))?;
        background.set_supported_formats(ges::TrackType::VIDEO);
        background.set_vpattern(ges::VideoTestPattern::SolidColor);
        if !background.set_duration(gst::ClockTime::from_mseconds(project.duration_ms())) {
            return Err(EditorError::Media("GES rejected canvas duration".into()));
        }
        timeline
            .append_layer()
            .add_clip(&background)
            .map_err(media)?;
        ges::prelude::TimelineElementExtManual::set_child_property(
            &background,
            "foreground-color",
            project.canvas.background.to_value(),
        )
        .map_err(media)?;
        for child in background.children(false) {
            if let Ok(element) = child.downcast::<ges::TrackElement>()
                && element.is::<ges::VideoSource>()
            {
                super::gpu::source::configure(&element)?;
            }
        }
        for (property, value) in [
            ("width", project.canvas.width as i32),
            ("height", project.canvas.height as i32),
            ("posx", 0),
            ("posy", 0),
        ] {
            ges::prelude::TimelineElementExtManual::set_child_property(
                &background,
                property,
                value.to_value(),
            )
            .map_err(media)?;
        }
    }
    if !timeline.commit_sync() {
        return Err(EditorError::Media(
            "GES could not commit the composition".into(),
        ));
    }
    let pipeline = ges::Pipeline::new();
    pipeline.set_timeline(&timeline).map_err(media)?;
    super::gpu::configure(&pipeline);
    super::seek::configure(&pipeline);
    Ok(pipeline)
}

/// Turns media-library errors into actionable native editor errors.
pub(crate) fn media(error: impl std::fmt::Display) -> EditorError {
    EditorError::Media(error.to_string())
}

/// Empty audio tracks synthesize silence in GES and require a sink even for video-only media.
pub(crate) fn has_audio(project: &Project) -> bool {
    project.clips.iter().any(|clip| {
        project
            .assets
            .iter()
            .any(|asset| asset.id == clip.asset_id && asset.has_audio)
    })
}

/// The synchronous GES URI helper drives the global main loop. Drive discovery
/// on the actor's context instead, including a deadline for broken sources.
fn load_source(uri: &str) -> Result<ges::Asset> {
    use futures_util::future::{Either, select};
    gst::glib::MainContext::ref_thread_default().block_on(async {
        let request = ges::Asset::request_future::<ges::UriClip>(Some(uri));
        let timeout = Box::pin(gst::glib::timeout_future_seconds(15));
        match select(request, timeout).await {
            Either::Left((result, _)) => result.map_err(media),
            Either::Right(_) => Err(EditorError::Media(
                "source discovery exceeded 15 seconds".into(),
            )),
        }
    })
}
