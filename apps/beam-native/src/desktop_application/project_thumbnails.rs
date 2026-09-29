//! Bounded project artwork for the native Projects window.

use super::{dispatch, types::AssetReference};
use crate::{
    json,
    services::{ServiceOutcome, ServiceRegistry},
};
use argui_paint::{ImageAsset, ImageId};
use argui_platform::WindowKey;
use argui_runtime::NativeHostApplicationRequest;
use gst::prelude::*;
use image::{DynamicImage, ImageFormat, RgbaImage};
use std::{
    fs,
    io::BufReader,
    path::{Path, PathBuf},
    sync::mpsc::Sender,
};

const WIDTH: u32 = 320;
const HEIGHT: u32 = 180;
const MAX_IMAGE_BYTES: u64 = 16 * 1024 * 1024;

pub(crate) fn register_project_thumbnail_service(
    registry: &ServiceRegistry,
    sender: Sender<NativeHostApplicationRequest>,
    root: PathBuf,
) {
    registry.register("beam", "projectThumbnail", move |payload| {
        let result = (|| {
            let id = payload
                .get("id")
                .and_then(|value| value.as_str())
                .ok_or("project thumbnail requires an ID")?;
            let project = crate::editor::find_recording(&root, id)?;
            let Some(raster) = project_thumbnail(&project)? else {
                return Ok(serde_json::Value::Null);
            };
            let uuid = uuid::Uuid::parse_str(id).map_err(|error| error.to_string())?;
            // ARGUI asset references cross JavaScript's safe-integer boundary.
            let image_id = (1_u64 << 52)
                | (u64::from_le_bytes(uuid.as_bytes()[0..8].try_into().unwrap())
                    & ((1_u64 << 52) - 1));
            let image = ImageAsset::rgba8(
                ImageId(image_id),
                raster.width(),
                raster.height(),
                raster.into_raw(),
            )
            .map_err(|error| error.to_string())?;
            match dispatch(&sender, |reply| {
                NativeHostApplicationRequest::RegisterWindowImage(
                    WindowKey::new("projects"),
                    image,
                    reply,
                )
            }) {
                ServiceOutcome::Ok(_) => {}
                ServiceOutcome::Error(error) => return Err(error),
                _ => return Err("native project image registration failed".into()),
            }
            json::encode(&AssetReference::Image { id: image_id })
        })();
        match result {
            Ok(value) => ServiceOutcome::Ok(value),
            Err(error) => ServiceOutcome::Error(error),
        }
    });
}

fn project_thumbnail(project: &Path) -> Result<Option<RgbaImage>, String> {
    for name in [
        "thumbnail.webp",
        "thumbnail.png",
        "thumbnail.jpg",
        "thumbnail.jpeg",
    ] {
        let path = project.join(name);
        if let Ok(Some(image)) = load_image(project, &path) {
            return Ok(Some(image));
        }
    }
    let Some(source) = crate::editor::project_preview_video(project) else {
        return Ok(None);
    };
    let image = decode_video_frame(&source)?;
    // Electron and subsequent native visits can share the derived artwork.
    let destination = project.join("thumbnail.png");
    if fs::symlink_metadata(&destination).is_err()
        && let Ok(mut file) = tempfile::NamedTempFile::new_in(project)
        && DynamicImage::ImageRgba8(image.clone())
            .write_to(file.as_file_mut(), ImageFormat::Png)
            .is_ok()
    {
        let _ = file.persist_noclobber(destination);
    }
    Ok(Some(image))
}

fn load_image(project: &Path, path: &Path) -> Result<Option<RgbaImage>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if !metadata.file_type().is_file() || metadata.len() > MAX_IMAGE_BYTES {
        return Ok(None);
    }
    if path
        .canonicalize()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        != Some(project.to_path_buf())
    {
        return Ok(None);
    }
    let mut reader = image::ImageReader::new(BufReader::new(
        fs::File::open(path).map_err(|e| e.to_string())?,
    ))
    .with_guessed_format()
    .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|error| error.to_string())?;
    Ok(Some(image.thumbnail(WIDTH, HEIGHT).into_rgba8()))
}

fn decode_video_frame(path: &Path) -> Result<RgbaImage, String> {
    gst::init().map_err(|error| error.to_string())?;
    let uri = gst::glib::filename_to_uri(path, None).map_err(|error| error.to_string())?;
    let player = gst::ElementFactory::make("playbin")
        .build()
        .map_err(|error| error.to_string())?;
    let sink_bin = gst::parse::bin_from_description(
        "videoconvert ! videoscale ! video/x-raw,format=RGBA,width=320,height=180 ! appsink name=project_thumb_sink sync=false enable-last-sample=false",
        true,
    ).map_err(|error| error.to_string())?;
    let sink = sink_bin
        .by_name("project_thumb_sink")
        .ok_or("thumbnail sink is unavailable")?
        .downcast::<gst_app::AppSink>()
        .map_err(|_| "thumbnail sink is invalid")?;
    sink.set_max_buffers(1);
    let audio_sink = gst::ElementFactory::make("fakesink")
        .build()
        .map_err(|error| error.to_string())?;
    player.set_property("uri", uri.as_str());
    player.set_property("video-sink", &sink_bin);
    player.set_property("audio-sink", &audio_sink);
    let result = (|| {
        player
            .set_state(gst::State::Paused)
            .map_err(|error| error.to_string())?;
        let (state, _, _) = player.state(gst::ClockTime::from_seconds(8));
        state.map_err(|error| error.to_string())?;
        if let Some(duration) = player.query_duration::<gst::ClockTime>() {
            let midpoint = gst::ClockTime::from_nseconds(duration.nseconds() / 2);
            player
                .seek_simple(gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE, midpoint)
                .map_err(|error| error.to_string())?;
        }
        let sample = sink
            .try_pull_preroll(gst::ClockTime::from_seconds(8))
            .ok_or("recording produced no thumbnail frame")?;
        let buffer = sample.buffer().ok_or("thumbnail frame has no buffer")?;
        let map = buffer.map_readable().map_err(|error| error.to_string())?;
        RgbaImage::from_raw(WIDTH, HEIGHT, map.as_slice().to_vec())
            .ok_or_else(|| "thumbnail frame has unexpected dimensions".into())
    })();
    let _ = player.set_state(gst::State::Null);
    result
}
