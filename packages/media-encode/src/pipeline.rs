use std::{
    fs::File,
    path::{Path, PathBuf},
};

use gst::prelude::*;

use crate::{AudioConfig, EncodeError, VideoConfig, VideoEncoding, video};

pub(crate) enum MediaConfig {
    Video(VideoConfig),
    Audio(AudioConfig),
}

pub(crate) struct TrackPipeline {
    pipeline: gst::Pipeline,
    source: gst_app::AppSrc,
    destination: PathBuf,
    partial: PathBuf,
    encoding: Option<VideoEncoding>,
}

impl TrackPipeline {
    pub(crate) fn encoding(&self) -> Option<VideoEncoding> {
        self.encoding
    }
    pub(crate) fn abort_handle(&self) -> gst::Pipeline {
        self.pipeline.clone()
    }

    pub(crate) fn open(destination: &Path, config: MediaConfig) -> Result<Self, EncodeError> {
        gst::init().map_err(|error| EncodeError::Pipeline(error.to_string()))?;
        let parent = destination.parent().ok_or_else(|| {
            EncodeError::InvalidFormat("track destination has no parent directory".into())
        })?;
        if !parent.is_dir() {
            return Err(EncodeError::storage(
                parent,
                std::io::Error::new(std::io::ErrorKind::NotFound, "track directory is missing"),
            ));
        }
        let file_name = destination.file_name().ok_or_else(|| {
            EncodeError::InvalidFormat("track destination has no filename".into())
        })?;
        let partial = destination.with_file_name(format!("{}.part", file_name.to_string_lossy()));
        if destination.exists() || partial.exists() {
            return Err(EncodeError::storage(
                destination,
                std::io::Error::new(
                    std::io::ErrorKind::AlreadyExists,
                    "track destination or partial file already exists",
                ),
            ));
        }

        let pipeline = gst::Pipeline::new();
        let source = element("appsrc")?
            .downcast::<gst_app::AppSrc>()
            .map_err(|_| EncodeError::Pipeline("appsrc has the wrong GObject type".into()))?;
        source.set_is_live(true);
        source.set_format(gst::Format::Time);
        source.set_block(true);

        let encoding = match config {
            MediaConfig::Video(config) => Some(video::select(config)?),
            MediaConfig::Audio(_) => None,
        };
        let (caps, middle, max_queue_bytes) = match config {
            MediaConfig::Video(video) => {
                let profile = encoding
                    .ok_or_else(|| EncodeError::Pipeline("missing recording profile".into()))?;
                let encoder = element(profile.factory)?;
                video::configure(&encoder, video, profile)?;
                let conversion = element("capsfilter")?;
                conversion.set_property(
                    "caps",
                    gst::Caps::builder("video/x-raw")
                        .field("format", profile.pixel_format)
                        .field("colorimetry", "bt709")
                        .build(),
                );
                let output = element("capsfilter")?;
                let mut encoded = gst::Caps::builder(format!("video/x-{}", profile.codec));
                if profile.pixel_format == "VUYA" {
                    encoded = encoded.field("profile", "1");
                }
                output.set_property("caps", encoded.build());
                let caps = gst::Caps::builder("video/x-raw")
                    .field("format", "RGBA")
                    .field("width", video.width as i32)
                    .field("height", video.height as i32)
                    .field("framerate", gst::Fraction::new(video.fps as i32, 1))
                    .build();
                (
                    caps,
                    vec![
                        element("videoconvert")?,
                        conversion,
                        encoder,
                        output,
                        element("webmmux")?,
                    ],
                    u64::try_from(video.rgba_bytes()?)
                        .unwrap_or(u64::MAX)
                        .saturating_mul(3)
                        .max(8 * 1024 * 1024),
                )
            }
            MediaConfig::Audio(audio) => {
                let caps = gst::Caps::builder("audio/x-raw")
                    .field("format", "F32LE")
                    .field("layout", "interleaved")
                    .field("rate", audio.sample_rate as i32)
                    .field("channels", i32::from(audio.channels))
                    .build();
                (
                    caps,
                    vec![element("audioconvert")?, element("wavenc")?],
                    8 * 1024 * 1024,
                )
            }
        };
        source.set_max_bytes(max_queue_bytes);
        source.set_caps(Some(&caps));
        let sink = element("filesink")?;
        let location = partial.to_str().ok_or_else(|| {
            EncodeError::InvalidFormat("GStreamer track path is not UTF-8".into())
        })?;
        sink.set_property("location", location);
        let mut elements = Vec::with_capacity(middle.len() + 2);
        elements.push(source.clone().upcast::<gst::Element>());
        elements.extend(middle);
        elements.push(sink);
        pipeline
            .add_many(&elements)
            .map_err(|error| EncodeError::Pipeline(error.to_string()))?;
        gst::Element::link_many(&elements)
            .map_err(|error| EncodeError::Pipeline(error.to_string()))?;
        pipeline
            .set_state(gst::State::Playing)
            .map_err(|error| EncodeError::Pipeline(error.to_string()))?;

        Ok(Self {
            pipeline,
            source,
            destination: destination.to_path_buf(),
            partial,
            encoding,
        })
    }

    pub(crate) fn push(
        &self,
        data: Vec<u8>,
        pts_ns: u64,
        duration_ns: u64,
    ) -> Result<(), EncodeError> {
        let mut buffer = gst::Buffer::from_mut_slice(data);
        let writable = buffer
            .get_mut()
            .ok_or_else(|| EncodeError::Pipeline("new buffer is not writable".into()))?;
        writable.set_pts(gst::ClockTime::from_nseconds(pts_ns));
        writable.set_duration(gst::ClockTime::from_nseconds(duration_ns));
        self.source
            .push_buffer(buffer)
            .map_err(|error| EncodeError::Pipeline(error.to_string()))?;
        Ok(())
    }

    pub(crate) fn finish(self) -> Result<PathBuf, EncodeError> {
        let eos_result = self
            .source
            .end_of_stream()
            .map_err(|error| EncodeError::Pipeline(error.to_string()));
        let result = eos_result.and_then(|_| {
            let bus = self
                .pipeline
                .bus()
                .ok_or_else(|| EncodeError::Pipeline("pipeline has no message bus".into()))?;
            let message = bus.timed_pop_filtered(
                gst::ClockTime::from_seconds(15),
                &[gst::MessageType::Eos, gst::MessageType::Error],
            );
            match message.as_ref().map(|message| message.view()) {
                Some(gst::MessageView::Eos(..)) => Ok(()),
                Some(gst::MessageView::Error(error)) => Err(EncodeError::Pipeline(format!(
                    "{}: {}",
                    error
                        .src()
                        .map(|source| source.path_string().to_string())
                        .unwrap_or_else(|| "unknown element".into()),
                    error.error()
                ))),
                _ => Err(EncodeError::Pipeline(
                    "timed out waiting for GStreamer EOS".into(),
                )),
            }
        });
        let stopped = self
            .pipeline
            .set_state(gst::State::Null)
            .map_err(|error| EncodeError::Pipeline(error.to_string()));
        result?;
        stopped?;
        File::open(&self.partial)
            .and_then(|file| file.sync_all())
            .map_err(|error| EncodeError::storage(&self.partial, error))?;
        std::fs::rename(&self.partial, &self.destination)
            .map_err(|error| EncodeError::storage(&self.destination, error))?;
        if let Some(parent) = self.destination.parent() {
            let _ = File::open(parent).and_then(|directory| directory.sync_all());
        }
        Ok(self.destination)
    }

    pub(crate) fn stop_without_finalizing(self) {
        let _ = self.pipeline.set_state(gst::State::Null);
    }
}

fn element(name: &str) -> Result<gst::Element, EncodeError> {
    gst::ElementFactory::make(name)
        .build()
        .map_err(|error| EncodeError::Pipeline(format!("missing or unusable {name}: {error}")))
}
