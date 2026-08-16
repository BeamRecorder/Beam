use std::{path::Path, sync::Arc};

use screencapturekit::{
    cm::CMTime,
    recording_output::{
        SCRecordingOutput, SCRecordingOutputCodec, SCRecordingOutputConfiguration,
        SCRecordingOutputFileType,
    },
    shareable_content::SCShareableContent,
    stream::{
        SCStream, configuration::SCStreamConfiguration, content_filter::SCContentFilter,
        output_type::SCStreamOutputType,
    },
};

use crate::{
    CaptureError,
    model::{ScreenRegion, SourceId},
    screen::{ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest},
    session::StartGate,
};

pub struct MacRecording {
    stream: Option<SCStream>,
    recording: SCRecordingOutput,
    output: std::path::PathBuf,
    frame_handler: usize,
    metrics: Arc<ScreenCaptureMetrics>,
}

impl MacRecording {
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        let crate::model::ScreenSelection::Source { source_id } = request.selection else {
            return Err(CaptureError::InvalidConfiguration(
                "macOS screen capture requires a direct source".into(),
            ));
        };
        let ScreenConsumer::EncodedFile { path, .. } = request.consumer else {
            return Err(CaptureError::Unsupported(
                "macOS raw screen samples are not available".into(),
            ));
        };
        Self::start(
            source_id,
            &path,
            request.recording.target_fps,
            matches!(
                request.cursor,
                crate::model::CursorSelection::Separate { .. }
            ),
            request.region,
            request.start_gate,
        )
    }

    pub fn start(
        source_id: &SourceId,
        output: &Path,
        fps: u32,
        exclude_cursor: bool,
        region: Option<ScreenRegion>,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        if fps == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "video fps must be non-zero".into(),
            ));
        }
        let content = SCShareableContent::get().map_err(backend_error)?;
        let (filter, width, height, source_rect) = resolve_filter(&content, source_id, region)?;
        let timescale = i32::try_from(fps).map_err(backend_error)?;
        let mut configuration = SCStreamConfiguration::new()
            .with_width(width)
            .with_height(height)
            .with_minimum_frame_interval(&CMTime::new(1, timescale))
            .with_queue_depth(8)
            .with_shows_cursor(!exclude_cursor)
            .with_captures_audio(false);
        if let Some(source_rect) = source_rect {
            configuration = configuration.with_source_rect(source_rect);
        }
        let output_configuration = SCRecordingOutputConfiguration::new()
            .with_output_url(output)
            .with_video_codec(SCRecordingOutputCodec::H264)
            .with_output_file_type(SCRecordingOutputFileType::MP4);
        let recording = SCRecordingOutput::new(&output_configuration).ok_or_else(|| {
            CaptureError::Unsupported(
                "direct ScreenCaptureKit recording requires macOS 15 or newer".into(),
            )
        })?;
        let metrics = Arc::new(ScreenCaptureMetrics::default());
        let callback_metrics = metrics.clone();
        let callback_gate = start_gate;
        let mut stream = SCStream::new(&filter, &configuration);
        let frame_handler = stream
            .add_output_handler(
                move |_, _| {
                    if !callback_gate.is_released() && callback_gate.wait().is_err() {
                        callback_metrics.dropped_frames(1);
                        return;
                    }
                    callback_metrics.received_frame(None, false);
                },
                SCStreamOutputType::Screen,
            )
            .ok_or_else(|| {
                CaptureError::Backend("ScreenCaptureKit rejected the screen output".into())
            })?;
        stream
            .add_recording_output(&recording)
            .map_err(backend_error)?;
        stream.start_capture().map_err(backend_error)?;
        Ok(Self {
            stream: Some(stream),
            recording,
            output: output.to_owned(),
            frame_handler,
            metrics,
        })
    }

    pub fn stop(&mut self) -> Result<i64, CaptureError> {
        self.finish()
    }

    #[must_use]
    pub fn recorded_file_size(&self) -> i64 {
        self.recording.recorded_file_size()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
        self.metrics.clone()
    }

    fn finish(&mut self) -> Result<i64, CaptureError> {
        if let Some(mut stream) = self.stream.take() {
            stream.stop_capture().map_err(backend_error)?;
            let _removed =
                stream.remove_output_handler(self.frame_handler, SCStreamOutputType::Screen);
            stream
                .remove_recording_output(&self.recording)
                .map_err(backend_error)?;
        }
        let size = self.recording.recorded_file_size();
        if size <= 0 {
            let _ = std::fs::remove_file(&self.output);
            return Err(CaptureError::Backend(
                "ScreenCaptureKit produced no frames for the selected window".into(),
            ));
        }
        Ok(size)
    }
}

impl Drop for MacRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

pub(crate) fn resolve_filter(
    content: &SCShareableContent,
    source_id: &SourceId,
    region: Option<ScreenRegion>,
) -> Result<
    (
        SCContentFilter,
        u32,
        u32,
        Option<screencapturekit::cg::CGRect>,
    ),
    CaptureError,
> {
    if let Some(id) = source_id.as_str().strip_prefix("sck:display:") {
        let display_id = id
            .parse::<u32>()
            .map_err(|error| CaptureError::InvalidConfiguration(error.to_string()))?;
        let display = content
            .displays()
            .into_iter()
            .find(|display| display.display_id() == display_id)
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        let width = display.width();
        let height = display.height();
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();
        let Some(region) = region else {
            return Ok((filter, width, height, None));
        };
        let (left, top, right, bottom) = region.pixel_rect(width, height)?;
        let frame = display.frame();
        let scale_x = frame.size.width / f64::from(width);
        let scale_y = frame.size.height / f64::from(height);
        let source_rect = screencapturekit::cg::CGRect::new(
            scale_x * f64::from(left),
            scale_y * f64::from(top),
            scale_x * f64::from(right - left),
            scale_y * f64::from(bottom - top),
        );
        return Ok((
            filter,
            right.saturating_sub(left),
            bottom.saturating_sub(top),
            Some(source_rect),
        ));
    }
    if let Some(id) = source_id.as_str().strip_prefix("sck:window:") {
        let window_id = id
            .parse::<u32>()
            .map_err(|error| CaptureError::InvalidConfiguration(error.to_string()))?;
        let window = content
            .windows()
            .into_iter()
            .find(|window| window.window_id() == window_id)
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        let frame = window.frame();
        if region.is_some() {
            return Err(CaptureError::InvalidConfiguration(
                "screen region requires a display source".into(),
            ));
        }
        return Ok((
            SCContentFilter::create().with_window(&window).build(),
            dimension(frame.size.width),
            dimension(frame.size.height),
            None,
        ));
    }
    if source_id.as_str().starts_with("sck:application:") {
        let application = content
            .applications()
            .into_iter()
            .find(|application| application_id(application).is_ok_and(|id| &id == source_id))
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| CaptureError::SourceNotFound("primary display".into()))?;
        let width = display.width();
        let height = display.height();
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_including_applications(&[&application], &[])
            .build();
        if region.is_some() {
            return Err(CaptureError::InvalidConfiguration(
                "screen region requires a display source".into(),
            ));
        }
        return Ok((filter, width, height, None));
    }
    Err(CaptureError::InvalidConfiguration(format!(
        "{source_id} is not a ScreenCaptureKit source"
    )))
}

fn application_id(
    application: &screencapturekit::shareable_content::SCRunningApplication,
) -> Result<SourceId, CaptureError> {
    SourceId::new(format!(
        "sck:application:{}:{}",
        application.process_id(),
        application.bundle_identifier()
    ))
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn dimension(value: f64) -> u32 {
    let rounded = value.clamp(2.0, f64::from(u32::MAX)) as u32;
    (rounded & !1).max(2)
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("ScreenCaptureKit recording failed: {error}"))
}
