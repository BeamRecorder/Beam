use crate::{
    CaptureError,
    model::{CursorSelection, RecordingSettings},
    screen::{ScreenConsumer, ScreenSampleSink, ScreenSegment},
};

pub(super) struct PreparedSink {
    pub sink: Box<dyn ScreenSampleSink>,
    pub encoded: bool,
    pub codec: Option<String>,
}
pub(super) fn prepare(
    consumer: ScreenConsumer,
    recording: &RecordingSettings,
    cursor: CursorSelection,
    start_ns: u64,
) -> Result<PreparedSink, CaptureError> {
    match consumer {
        ScreenConsumer::Samples(sink) => Ok(PreparedSink {
            sink,
            encoded: false,
            codec: None,
        }),
        ScreenConsumer::EncodedFile {
            path,
            cursor_directory,
        } => {
            let capabilities = super::probe_ffmpeg()?;
            let codec = capabilities.encoder.codec.clone();
            let interactions = matches!(
                cursor,
                CursorSelection::Separate {
                    capture_clicks: true,
                    ..
                } | CursorSelection::Separate {
                    capture_shortcuts: true,
                    ..
                }
            );
            let sink = super::FfmpegScreenSink::new(
                capabilities,
                recording.clone(),
                ScreenSegment { path, start_ns },
                cursor_directory,
                interactions,
            )?;
            Ok(PreparedSink {
                sink: Box::new(sink),
                encoded: true,
                codec: Some(codec),
            })
        }
    }
}
