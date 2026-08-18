use std::{
    cell::RefCell,
    rc::Rc,
    sync::mpsc,
    sync::{Arc, Mutex},
    thread::JoinHandle,
};

use crossbeam_channel::{Receiver, select};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    screen::{PixelFormat, ScreenSampleSink, VideoFormat},
};

use super::{CursorMessage, NegotiatedFormat, SinkMessage};

pub(super) type ReadySender =
    Rc<RefCell<Option<mpsc::SyncSender<Result<VideoFormat, CaptureError>>>>>;

pub(super) fn sink_worker(
    mut sink: Box<dyn ScreenSampleSink>,
    receiver: Receiver<SinkMessage>,
    cursor_receiver: Receiver<CursorMessage>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
) -> Result<(), CaptureError> {
    let mut first_error = None;
    let mut cursor_open = true;
    loop {
        let message = if cursor_open {
            select! {
                recv(cursor_receiver) -> message => match message {
                    Ok(message) => WorkerMessage::Cursor(message),
                    Err(_) => {
                        cursor_open = false;
                        continue;
                    }
                },
                recv(receiver) -> message => match message {
                    Ok(message) => WorkerMessage::Sink(message),
                    Err(_) => break,
                },
            }
        } else {
            match receiver.recv() {
                Ok(message) => WorkerMessage::Sink(message),
                Err(_) => break,
            }
        };
        let result = match message {
            WorkerMessage::Cursor(message) => sink.push_cursor(message.session_ns, message.cursor),
            WorkerMessage::Sink(SinkMessage::BeginSegment(segment, reply)) => {
                let result = sink.begin_segment(segment);
                let reply_result = match &result {
                    Ok(()) => Ok(()),
                    Err(error) => Err(sink_error(error.to_string())),
                };
                let _ = reply.send(reply_result);
                result
            }
            WorkerMessage::Sink(SinkMessage::Format(format)) => sink.format_changed(format),
            WorkerMessage::Sink(SinkMessage::Sample(sample)) => sink.push(sample),
            WorkerMessage::Sink(SinkMessage::Discontinuity(event)) => sink.discontinuity(event),
            WorkerMessage::Sink(SinkMessage::EndSegment(reply)) => {
                drain_cursor_messages(&mut *sink, &cursor_receiver, &mut first_error, &fatal);
                let result = sink.end_segment();
                let reply_result = match &result {
                    Ok(()) => Ok(()),
                    Err(error) => Err(sink_error(error.to_string())),
                };
                let _ = reply.send(reply_result);
                result
            }
            WorkerMessage::Sink(SinkMessage::Finish) => {
                drain_cursor_messages(&mut *sink, &cursor_receiver, &mut first_error, &fatal);
                let finish = sink.finish();
                if first_error.is_none() {
                    first_error = finish.err();
                }
                break;
            }
        };
        retain_first_error(&mut first_error, result, &fatal);
    }
    first_error.map_or(Ok(()), Err)
}

enum WorkerMessage {
    Sink(SinkMessage),
    Cursor(CursorMessage),
}

fn drain_cursor_messages(
    sink: &mut dyn ScreenSampleSink,
    cursor_receiver: &Receiver<CursorMessage>,
    first_error: &mut Option<CaptureError>,
    fatal: &Arc<Mutex<Option<CaptureError>>>,
) {
    for message in cursor_receiver.try_iter() {
        retain_first_error(
            first_error,
            sink.push_cursor(message.session_ns, message.cursor),
            fatal,
        );
    }
}

fn retain_first_error(
    first_error: &mut Option<CaptureError>,
    result: Result<(), CaptureError>,
    fatal: &Arc<Mutex<Option<CaptureError>>>,
) {
    if first_error.is_none() {
        *first_error = result.err();
        if let Some(error) = first_error.take() {
            set_fatal(fatal, sink_error(error.to_string()));
            *first_error = Some(error);
        }
    }
}

pub(super) fn send_ready_ok(ready: &ReadySender, format: NegotiatedFormat) {
    if let Some(sender) = ready.borrow_mut().take() {
        let stride = usize::try_from(format.width)
            .unwrap_or(usize::MAX)
            .saturating_mul(4);
        let _ = sender.send(Ok(VideoFormat {
            width: format.width,
            height: format.height,
            stride,
            pixel_format: PixelFormat::Bgra8,
        }));
    }
}

pub(super) fn send_ready_error(ready: &ReadySender, error: CaptureError) {
    if let Some(sender) = ready.borrow_mut().take() {
        let _ = sender.send(Err(error));
    }
}

pub(super) fn set_fatal(slot: &Arc<Mutex<Option<CaptureError>>>, error: CaptureError) {
    if let Ok(mut slot) = slot.lock()
        && slot.is_none()
    {
        *slot = Some(error);
    }
}

pub(super) fn has_fatal(slot: &Arc<Mutex<Option<CaptureError>>>) -> bool {
    slot.lock().map_or(true, |slot| slot.is_some())
}

pub(super) fn take_fatal(slot: &Arc<Mutex<Option<CaptureError>>>) -> Result<(), CaptureError> {
    let mut slot = slot
        .lock()
        .map_err(|_| sink_error("screen capture error lock was poisoned"))?;
    slot.take().map_or(Ok(()), Err)
}

pub(super) fn join(
    thread: &mut Option<JoinHandle<Result<(), CaptureError>>>,
    name: &str,
) -> Result<Result<(), CaptureError>, CaptureError> {
    thread.take().map_or(Ok(Ok(())), |thread| {
        thread
            .join()
            .map_err(|_| pipewire_error(format!("{name} worker panicked")))
    })
}

pub(super) fn pipewire_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireConnectFailed,
        error.to_string(),
    )
}

pub(super) fn stream_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireStreamDisconnected,
        error.to_string(),
    )
}

pub(super) fn format_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireFormatUnsupported,
        error.to_string(),
    )
}

pub(super) fn sink_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(NativeCaptureErrorCode::ScreenSinkFailed, error.to_string())
}
