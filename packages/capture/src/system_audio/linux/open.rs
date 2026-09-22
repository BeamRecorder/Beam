use super::writer::writer_worker;
use super::*;
use crate::system_audio::wav::FloatWavWriter;
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    thread,
};

fn finish_worker_sink(sink: &Sender<SinkMessage>, timeout: Duration) -> Result<(), CaptureError> {
    sink.send_timeout(SinkMessage::Finish, timeout)
        .map_err(|_| CaptureError::Backend("system audio writer did not accept shutdown".into()))
}

impl PipewireSystemAudioRecording {
    pub(super) fn open_inner(
        selection: SystemAudioSelection,
        segment: Option<SystemAudioSegment>,
        start_gate: Arc<StartGate>,
        queue_capacity: usize,
    ) -> Result<Self, CaptureError> {
        Self::open_inner_with_worker(
            selection,
            segment,
            start_gate,
            queue_capacity,
            pipewire_worker,
        )
    }

    fn open_inner_with_worker(
        selection: SystemAudioSelection,
        segment: Option<SystemAudioSegment>,
        start_gate: Arc<StartGate>,
        queue_capacity: usize,
        run_worker: impl FnOnce(
            pw::channel::Receiver<Command>,
            Sender<SinkMessage>,
            Arc<Mutex<Option<CaptureError>>>,
            Arc<SystemAudioMetrics>,
            Arc<StartGate>,
            bool,
            mpsc::SyncSender<Result<SystemAudioFormat, CaptureError>>,
        ) -> Result<(), CaptureError>
        + Send
        + 'static,
    ) -> Result<Self, CaptureError> {
        match selection {
            SystemAudioSelection::DefaultOutput => {}
        }
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "system audio queue capacity must be non-zero".into(),
            ));
        }
        let persist_samples = segment.is_some();
        let (sink, receiver) = crossbeam_channel::bounded(queue_capacity);
        let (commands, command_receiver) = pw::channel::channel();
        let (ready, ready_receiver) = mpsc::sync_channel(1);
        let fatal = Arc::new(Mutex::new(None));
        let metrics = Arc::new(SystemAudioMetrics::default());
        let worker_sink = sink.clone();
        let worker_fatal = fatal.clone();
        let worker_metrics = metrics.clone();
        let worker_gate = start_gate.clone();
        let worker = thread::Builder::new()
            .name("beam-linux-system-audio".into())
            .spawn(move || {
                let result = catch_unwind(AssertUnwindSafe(|| {
                    run_worker(
                        command_receiver,
                        worker_sink.clone(),
                        worker_fatal,
                        worker_metrics,
                        worker_gate,
                        persist_samples,
                        ready,
                    )
                }))
                .unwrap_or_else(|_| Err(pipewire_error("system audio PipeWire worker panicked")));
                let finished = finish_worker_sink(&worker_sink, READY_TIMEOUT);
                result.and(finished)
            })
            .map_err(pipewire_error)?;
        let negotiated = ready_receiver
            .recv_timeout(READY_TIMEOUT)
            .map_err(|_| pipewire_error("system audio format negotiation timed out"))
            .and_then(|result| result);
        let format = match negotiated {
            Ok(format) => format,
            Err(error) => {
                let _ = commands.send(Command::Stop);
                let worker_error = worker.join().ok().and_then(Result::err);
                return worker_error.map_or_else(|| take_fatal(&fatal).and(Err(error)), Err);
            }
        };
        let initial_writer = match segment {
            Some(segment) => match FloatWavWriter::create(&segment.path, format) {
                Ok(writer) => Some(writer),
                Err(error) => {
                    let _ = commands.send(Command::Stop);
                    let _ = worker.join();
                    return Err(error);
                }
            },
            None => None,
        };
        let writer_fatal = fatal.clone();
        let writer = thread::Builder::new()
            .name("beam-system-audio-writer".into())
            .spawn(move || writer_worker(receiver, format, initial_writer, writer_fatal))
            .map_err(|error| CaptureError::Backend(error.to_string()));
        let writer = match writer {
            Ok(writer) => writer,
            Err(error) => {
                let _ = commands.send(Command::Stop);
                let _ = worker.join();
                return Err(error);
            }
        };
        Ok(Self {
            commands: Some(commands),
            sink,
            worker: Some(worker),
            writer: Some(writer),
            fatal,
            format,
            metrics,
            start_gate,
            running: false,
        })
    }
}

#[path = "../../../test/system_audio/linux/open.rs"]
mod open_checks;
