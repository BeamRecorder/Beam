use std::{
    path::Path,
    time::{Duration, Instant},
};

use crossbeam_channel::{Receiver, Sender, TryRecvError, TrySendError, bounded};
use windows::{
    Foundation::{TimeSpan, TypedEventHandler},
    Media::{
        Core::{MediaStreamSample, MediaStreamSource, VideoStreamDescriptor},
        MediaProperties::{
            MediaEncodingProfile, MediaEncodingSubtypes, VideoEncodingProperties,
            VideoEncodingQuality,
        },
        Transcoding::MediaTranscoder,
    },
    Security::Cryptography::CryptographicBuffer,
    Storage::{FileAccessMode, StorageFile},
    System::Threading::{ThreadPool, WorkItemHandler},
    core::HSTRING,
};
use windows_capture::frame::Frame;
use windows_future::IAsyncActionWithProgress;

use crate::screen::recording_queue::{FrameQueuePressure, frame_queue_capacity};

const FINALIZE_TIMEOUT: Duration = Duration::from_secs(15);

/// Own the native encoder queue: windows-capture's VideoEncoder uses an
/// unbounded channel and joins its transcode thread without an exit deadline.
pub(super) struct RecordingEncoder {
    sender: Option<Sender<MediaStreamSample>>,
    completion: Receiver<Result<(), String>>,
    completion_result: Option<Result<(), String>>,
    action: IAsyncActionWithProgress<f64>,
    source: MediaStreamSource,
    starting_token: i64,
    sample_token: i64,
    first_timestamp: Option<i64>,
    pressure: FrameQueuePressure,
}

impl RecordingEncoder {
    pub(super) fn new(
        output: &Path,
        width: u32,
        height: u32,
        bitrate: u32,
        fps: u32,
    ) -> Result<Self, String> {
        let capacity = frame_queue_capacity(width, height).map_err(|error| error.to_string())?;
        let profile =
            MediaEncodingProfile::CreateMp4(VideoEncodingQuality::Auto).map_err(message)?;
        profile.SetAudio(None).map_err(message)?;
        let video = profile.Video().map_err(message)?;
        video.SetWidth(width).map_err(message)?;
        video.SetHeight(height).map_err(message)?;
        video.SetBitrate(bitrate).map_err(message)?;
        video
            .FrameRate()
            .and_then(|rate| {
                rate.SetNumerator(fps)?;
                rate.SetDenominator(1)
            })
            .map_err(message)?;
        let raw = VideoEncodingProperties::CreateUncompressed(
            &MediaEncodingSubtypes::Bgra8().map_err(message)?,
            width,
            height,
        )
        .map_err(message)?;
        let descriptor = VideoStreamDescriptor::Create(&raw).map_err(message)?;
        let source = MediaStreamSource::CreateFromDescriptor(&descriptor).map_err(message)?;
        source
            .SetBufferTime(TimeSpan { Duration: 0 })
            .map_err(message)?;
        let starting_token = source
            .Starting(&TypedEventHandler::new(
                |_,
                 args: windows::core::Ref<
                    windows::Media::Core::MediaStreamSourceStartingEventArgs,
                >| {
                    args.as_ref()
                        .ok_or_else(|| {
                            windows::core::Error::from_hresult(windows::core::HRESULT(
                                0x80004003_u32 as i32,
                            ))
                        })?
                        .Request()?
                        .SetActualStartPosition(TimeSpan { Duration: 0 })
                },
            ))
            .map_err(message)?;
        let (sender, receiver) = bounded::<MediaStreamSample>(capacity);
        let sample_token = attach_samples(&source, receiver).map_err(message)?;
        std::fs::File::create(output).map_err(message)?;
        let canonical = std::fs::canonicalize(output).map_err(message)?;
        // WinRT requires a DOS/UNC path rather than Rust's extended-length prefix.
        let path = canonical.to_string_lossy();
        let path = path.strip_prefix("\\\\?\\UNC\\").map_or_else(
            || path.strip_prefix("\\\\?\\").unwrap_or(&path).to_owned(),
            |unc| format!("\\\\{unc}"),
        );
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
            .and_then(|operation| operation.join())
            .map_err(message)?;
        let output = file
            .OpenAsync(FileAccessMode::ReadWrite)
            .and_then(|operation| operation.join())
            .map_err(message)?;
        let transcoder = MediaTranscoder::new().map_err(message)?;
        transcoder
            .SetHardwareAccelerationEnabled(true)
            .map_err(message)?;
        let prepared = transcoder
            .PrepareMediaStreamSourceTranscodeAsync(&source, &output, &profile)
            .and_then(|operation| operation.join())
            .map_err(message)?;
        if !prepared.CanTranscode().map_err(message)? {
            return Err(format!(
                "Windows cannot encode this recording: {:?}",
                prepared.FailureReason().map_err(message)?
            ));
        }
        let action = prepared.TranscodeAsync().map_err(message)?;
        let (completed, completion) = bounded(1);
        let worker_action = action.clone();
        std::thread::Builder::new()
            .name("beam-wgc-encoder".into())
            .spawn(move || {
                let result = worker_action.join().map_err(message);
                let _ = completed.send(result);
                drop(transcoder);
            })
            .map_err(message)?;
        Ok(Self {
            sender: Some(sender),
            completion,
            completion_result: None,
            action,
            source,
            starting_token,
            sample_token,
            first_timestamp: None,
            pressure: FrameQueuePressure::default(),
        })
    }

    pub(super) fn has_capacity(&mut self) -> Result<bool, String> {
        self.check_running()?;
        let available = self.sender.as_ref().is_some_and(|sender| !sender.is_full());
        self.pressure
            .check(available, Instant::now())
            .map_err(message)
    }

    pub(super) fn send_frame(&mut self, frame: &Frame) -> Result<bool, String> {
        let timestamp = self.timestamp(frame.timestamp().map_err(message)?.Duration);
        let sample =
            MediaStreamSample::CreateFromDirect3D11Surface(frame.as_raw_surface(), timestamp)
                .map_err(message)?;
        self.send(sample)
    }

    pub(super) fn send_frame_buffer(
        &mut self,
        bytes: &[u8],
        timestamp: i64,
    ) -> Result<bool, String> {
        let timestamp = self.timestamp(timestamp);
        let buffer = CryptographicBuffer::CreateFromByteArray(bytes).map_err(message)?;
        let sample = MediaStreamSample::CreateFromBuffer(&buffer, timestamp).map_err(message)?;
        self.send(sample)
    }

    fn send(&mut self, sample: MediaStreamSample) -> Result<bool, String> {
        self.check_running()?;
        match self
            .sender
            .as_ref()
            .ok_or("Windows encoder was finalized")?
            .try_send(sample)
        {
            Ok(()) => Ok(true),
            Err(TrySendError::Full(_)) => Ok(false),
            Err(TrySendError::Disconnected(_)) => {
                Err("Windows encoder stopped accepting frames".into())
            }
        }
    }

    fn check_running(&mut self) -> Result<(), String> {
        if self.completion_result.is_none() {
            self.completion_result = match self.completion.try_recv() {
                Ok(result) => Some(result),
                Err(TryRecvError::Empty) => None,
                Err(TryRecvError::Disconnected) => {
                    Some(Err("Windows encoder worker exited unexpectedly".into()))
                }
            };
        }
        match &self.completion_result {
            Some(Ok(())) => Err("Windows encoder stopped before recording finished".into()),
            Some(Err(error)) => Err(error.clone()),
            None => Ok(()),
        }
    }

    fn timestamp(&mut self, timestamp: i64) -> TimeSpan {
        let first = *self.first_timestamp.get_or_insert(timestamp);
        TimeSpan {
            Duration: timestamp.saturating_sub(first),
        }
    }

    pub(super) fn finish(mut self) -> Result<(), String> {
        // Closing the producer delivers EOS after at most the bounded queue.
        self.sender.take();
        if let Some(result) = self.completion_result.take() {
            return result;
        }
        self.completion
            .recv_timeout(FINALIZE_TIMEOUT)
            .map_err(|_| {
                "Windows encoder did not finish within 15 seconds; recording was stopped".to_owned()
            })?
    }
}

impl Drop for RecordingEncoder {
    fn drop(&mut self) {
        self.sender.take();
        let _ = self.action.Cancel();
        let _ = self.source.RemoveSampleRequested(self.sample_token);
        let _ = self.source.RemoveStarting(self.starting_token);
    }
}

fn attach_samples(
    source: &MediaStreamSource,
    receiver: Receiver<MediaStreamSample>,
) -> windows::core::Result<i64> {
    source.SampleRequested(&TypedEventHandler::new(
        move |_,
              args: windows::core::Ref<
            windows::Media::Core::MediaStreamSourceSampleRequestedEventArgs,
        >| {
            let request = args
                .as_ref()
                .ok_or_else(|| {
                    windows::core::Error::from_hresult(windows::core::HRESULT(
                        0x80004003_u32 as i32,
                    ))
                })?
                .Request()?;
            let deferral = request.GetDeferral()?;
            let receiver = receiver.clone();
            let cleanup_deferral = deferral.clone();
            let scheduled = ThreadPool::RunAsync(&WorkItemHandler::new(move |_| {
                let sample = receiver.recv().ok();
                let result = request.SetSample(sample.as_ref());
                let complete = deferral.Complete();
                result.and(complete)
            }));
            if let Err(error) = scheduled {
                cleanup_deferral.Complete()?;
                return Err(error);
            }
            Ok(())
        },
    ))
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(all(test, feature = "hardware-tests"))]
#[path = "encoder_tests.rs"]
mod tests;
