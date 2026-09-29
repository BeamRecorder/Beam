use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use beam_media_core::{AudioPacket, VideoFrame};
use crossbeam_channel::{Receiver, SendTimeoutError, Sender, TrySendError};
use gst::prelude::*;

use crate::{
    AudioConfig, EncodeError, QueueLimits, VideoConfig, VideoEncoding,
    pipeline::{MediaConfig, TrackPipeline},
};

enum Command {
    Packet {
        data: Vec<u8>,
        pts_ns: u64,
        duration_ns: u64,
    },
    Finish,
}

enum Format {
    Video(VideoConfig),
    Audio(AudioConfig),
}

/// A source callback can submit packets without waiting for disk or GStreamer.
/// One worker and two independent queue limits belong to each track.
pub struct TrackWriter {
    format: Format,
    limits: QueueLimits,
    sender: Option<Sender<Command>>,
    worker: Option<JoinHandle<Result<PathBuf, EncodeError>>>,
    completion: Receiver<()>,
    abort_pipeline: gst::Pipeline,
    queued_bytes: Arc<AtomicUsize>,
    accepted_packets: AtomicUsize,
    worker_error: Arc<Mutex<Option<String>>>,
    last_position_ns: Mutex<Option<u64>>,
    encoding: Option<VideoEncoding>,
}

impl TrackWriter {
    /// Returns the negotiated recording profile; PCM audio has no video encoder.
    pub fn video_encoding(&self) -> Option<VideoEncoding> {
        self.encoding
    }
    pub fn queue_depth(&self) -> (usize, usize) {
        (
            self.sender.as_ref().map_or(0, Sender::len),
            self.queued_bytes.load(Ordering::Acquire),
        )
    }

    pub fn open_video(
        destination: &Path,
        config: VideoConfig,
        limits: QueueLimits,
    ) -> Result<Self, EncodeError> {
        config.validate()?;
        Self::open(
            destination,
            MediaConfig::Video(config),
            Format::Video(config),
            limits,
        )
    }

    pub fn open_audio(
        destination: &Path,
        config: AudioConfig,
        limits: QueueLimits,
    ) -> Result<Self, EncodeError> {
        config.validate()?;
        Self::open(
            destination,
            MediaConfig::Audio(config),
            Format::Audio(config),
            limits,
        )
    }

    fn open(
        destination: &Path,
        pipeline_config: MediaConfig,
        format: Format,
        limits: QueueLimits,
    ) -> Result<Self, EncodeError> {
        limits.validate()?;
        let pipeline = TrackPipeline::open(destination, pipeline_config)?;
        let encoding = pipeline.encoding();
        let abort_pipeline = pipeline.abort_handle();
        let (sender, receiver) = crossbeam_channel::bounded(limits.packets);
        let (completion_sender, completion) = crossbeam_channel::bounded(1);
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let worker_bytes = queued_bytes.clone();
        let worker_error = Arc::new(Mutex::new(None));
        let fatal = worker_error.clone();
        let worker = thread::Builder::new()
            .name("beam-media-encode".into())
            .spawn(move || {
                let result = run_worker(pipeline, receiver, &worker_bytes, &fatal);
                let _ = completion_sender.send(());
                result
            })
            .map_err(|error| EncodeError::Pipeline(format!("failed to start writer: {error}")))?;
        Ok(Self {
            format,
            limits,
            sender: Some(sender),
            worker: Some(worker),
            completion,
            abort_pipeline,
            queued_bytes,
            accepted_packets: AtomicUsize::new(0),
            worker_error,
            last_position_ns: Mutex::new(None),
            encoding,
        })
    }

    /// Number of packets accepted by this writer's bounded queue.
    pub fn accepted_packet_count(&self) -> usize {
        self.accepted_packets.load(Ordering::Relaxed)
    }

    pub fn push_video(
        &self,
        frame: VideoFrame<Vec<u8>>,
        duration_ns: u64,
    ) -> Result<(), EncodeError> {
        let Format::Video(config) = self.format else {
            return Err(EncodeError::InvalidFormat("writer expects audio".into()));
        };
        if frame.width != config.width
            || frame.height != config.height
            || frame.data.len() != config.rgba_bytes()?
        {
            return Err(EncodeError::InvalidFormat(
                "RGBA frame does not match the negotiated video format".into(),
            ));
        }
        self.push(frame.data, frame.captured_ns, duration_ns)
    }

    pub fn push_audio(&self, packet: AudioPacket<Vec<f32>>) -> Result<(), EncodeError> {
        let Format::Audio(config) = self.format else {
            return Err(EncodeError::InvalidFormat("writer expects video".into()));
        };
        if packet.sample_rate != config.sample_rate
            || packet.channels != config.channels
            || packet.frames == 0
            || packet.data.len() != packet.frames as usize * usize::from(config.channels)
        {
            return Err(EncodeError::InvalidFormat(
                "PCM packet does not match the negotiated audio format".into(),
            ));
        }
        let duration_ns = u64::from(packet.frames) * 1_000_000_000 / u64::from(config.sample_rate);
        let mut bytes = Vec::with_capacity(packet.data.len() * std::mem::size_of::<f32>());
        for sample in packet.data {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.push(bytes, packet.start_ns, duration_ns)
    }

    fn push(&self, data: Vec<u8>, pts_ns: u64, duration_ns: u64) -> Result<(), EncodeError> {
        if duration_ns == 0 {
            return Err(EncodeError::InvalidFormat(
                "packet duration must be non-zero".into(),
            ));
        }
        let end_ns = pts_ns
            .checked_add(duration_ns)
            .ok_or_else(|| EncodeError::InvalidFormat("packet timestamp overflow".into()))?;
        let mut last_position = self
            .last_position_ns
            .lock()
            .map_err(|_| EncodeError::WorkerStopped)?;
        let regressed = match self.format {
            Format::Video(_) => last_position.is_some_and(|previous| pts_ns <= previous),
            Format::Audio(_) => last_position.is_some_and(|previous| pts_ns < previous),
        };
        if regressed {
            return Err(EncodeError::NonMonotonic {
                pts_ns,
                last_end_ns: last_position.unwrap_or(0),
            });
        }
        let size = data.len();
        self.reserve(size)?;
        let command = Command::Packet {
            data,
            pts_ns,
            duration_ns,
        };
        let result = self
            .sender
            .as_ref()
            .ok_or(EncodeError::WorkerStopped)?
            .try_send(command);
        match result {
            Ok(()) => {
                self.accepted_packets.fetch_add(1, Ordering::Relaxed);
                *last_position = Some(match self.format {
                    Format::Video(_) => pts_ns,
                    Format::Audio(_) => end_ns,
                });
                Ok(())
            }
            Err(TrySendError::Full(_)) => {
                self.queued_bytes.fetch_sub(size, Ordering::AcqRel);
                Err(EncodeError::QueueFull { kind: "packets" })
            }
            Err(TrySendError::Disconnected(_)) => {
                self.queued_bytes.fetch_sub(size, Ordering::AcqRel);
                let reason = self
                    .worker_error
                    .lock()
                    .ok()
                    .and_then(|error| error.clone());
                Err(reason.map_or(EncodeError::WorkerStopped, EncodeError::WorkerFailed))
            }
        }
    }

    fn reserve(&self, size: usize) -> Result<(), EncodeError> {
        self.queued_bytes
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
                current
                    .checked_add(size)
                    .filter(|next| *next <= self.limits.bytes)
            })
            .map_err(|_| EncodeError::QueueFull { kind: "bytes" })?;
        Ok(())
    }

    pub fn finish(mut self) -> Result<PathBuf, EncodeError> {
        let sender = self.sender.take().ok_or(EncodeError::WorkerStopped)?;
        let sent = sender.send_timeout(Command::Finish, Duration::from_secs(15));
        drop(sender);
        match sent {
            Ok(()) | Err(SendTimeoutError::Disconnected(_)) => {}
            Err(SendTimeoutError::Timeout(_)) => {
                let _ = self.abort_pipeline.set_state(gst::State::Null);
                return Err(EncodeError::Pipeline("timed out queuing track EOS".into()));
            }
        }
        if self
            .completion
            .recv_timeout(Duration::from_secs(30))
            .is_err()
        {
            let _ = self.abort_pipeline.set_state(gst::State::Null);
            return Err(EncodeError::Pipeline(
                "timed out waiting for track EOS".into(),
            ));
        }
        self.worker
            .take()
            .ok_or(EncodeError::WorkerStopped)?
            .join()
            .map_err(|_| EncodeError::Pipeline("track worker panicked".into()))?
    }
}

impl Drop for TrackWriter {
    fn drop(&mut self) {
        self.sender.take();
        if self.worker.is_some() {
            let _ = self.abort_pipeline.set_state(gst::State::Null);
        }
        // A dropped writer leaves a .part file. Only an explicit EOS can publish a track.
    }
}

fn run_worker(
    pipeline: TrackPipeline,
    receiver: Receiver<Command>,
    queued_bytes: &AtomicUsize,
    worker_error: &Mutex<Option<String>>,
) -> Result<PathBuf, EncodeError> {
    while let Ok(command) = receiver.recv() {
        match command {
            Command::Packet {
                data,
                pts_ns,
                duration_ns,
            } => {
                let size = data.len();
                let result = pipeline.push(data, pts_ns, duration_ns);
                queued_bytes.fetch_sub(size, Ordering::AcqRel);
                if let Err(error) = result {
                    if let Ok(mut fatal) = worker_error.lock() {
                        *fatal = Some(error.to_string());
                    }
                    pipeline.stop_without_finalizing();
                    return Err(error);
                }
            }
            Command::Finish => return pipeline.finish(),
        }
    }
    pipeline.stop_without_finalizing();
    Err(EncodeError::WorkerStopped)
}
