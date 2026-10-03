use super::{
    CursorMessage, CursorState, DmaBufImporter, FormatParamEvent, ProcessState, SinkMessage,
    TimestampMapper, apply_format_event, backpressure_event, dma_buf_format_parameter,
    flush_pending_cursor, format_error, format_parameter, pipewire_error, process_buffer,
    send_ready_error, send_ready_ok, set_fatal, stream_error,
};
use crate::{
    CaptureError,
    model::ScreenRegion,
    screen::{ScreenCaptureMetrics, VideoFormat},
    session::StartGate,
};
use crossbeam_channel::Sender;
use pipewire::{self as pw, properties::properties, spa};
use spa::{param::ParamType, pod::Pod};
use std::{
    cell::{Cell, RefCell},
    os::fd::OwnedFd,
    rc::Rc,
    sync::{Arc, Mutex, mpsc},
    time::Instant,
};

use super::thread::PipewireCommand;

#[allow(clippy::too_many_arguments)]
pub(super) fn pipewire_worker(
    remote_fd: OwnedFd,
    node_id: u32,
    stream_scope: String,
    commands: pw::channel::Receiver<PipewireCommand>,
    sink: Sender<SinkMessage>,
    cursor_sink: Sender<CursorMessage>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
    metrics: Arc<ScreenCaptureMetrics>,
    start_ns: u64,
    start_gate: Arc<StartGate>,
    ready: mpsc::SyncSender<Result<VideoFormat, CaptureError>>,
    repair_window_crop: bool,
    region: Option<ScreenRegion>,
    show_real_cursor: bool,
    target_fps: u32,
    separate_cursor_enabled: bool,
) -> Result<(), CaptureError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
    let context = pw::context::ContextRc::new(&mainloop, None).map_err(pipewire_error)?;
    let core = context
        .connect_fd_rc(remote_fd, None)
        .map_err(pipewire_error)?;
    let stream = pw::stream::StreamRc::new(
        core,
        "beam-screen-capture",
        properties! {
            *pw::keys::MEDIA_TYPE => "Video",
            *pw::keys::MEDIA_CATEGORY => "Capture",
            *pw::keys::MEDIA_ROLE => "Screen",
        },
    )
    .map_err(pipewire_error)?;
    let state = Rc::new(RefCell::new(ProcessState {
        negotiated: None,
        last_announced: None,
        cursor: CursorState::new(stream_scope),
        native_cursor: super::NativeCursorOverlay::new(show_real_cursor, target_fps),
        timestamp: TimestampMapper::new(start_ns),
        start_gate,
        active: false,
        start_reply: None,
        stopping: false,
        clock: Instant::now(),
        sink,
        cursor_sink,
        pending_cursor: None,
        metrics,
        fatal,
        pending_drops: 0,
        last_frame_geometry: None,
        repair_window_crop,
        region,
        dmabuf_importer: DmaBufImporter::new(),
        separate_cursor_enabled,
    }));
    let ready = Rc::new(RefCell::new(Some(ready)));
    let negotiation_stopped = Rc::new(Cell::new(false));
    let listener_state = state.clone();
    let listener_ready = ready.clone();
    let listener_loop = mainloop.clone();
    let listener_negotiation_stopped = negotiation_stopped.clone();
    let format_loop = mainloop.clone();
    let format_negotiation_stopped = negotiation_stopped.clone();
    let listener = stream
        .add_local_listener_with_user_data(())
        .state_changed(move |stream, _, _, new| match new {
            pw::stream::StreamState::Error(message) => {
                set_fatal(&listener_state.borrow().fatal, stream_error(&message));
                send_ready_error(&listener_ready, pipewire_error(message));
                listener_loop.quit();
            }
            pw::stream::StreamState::Paused => {
                if listener_negotiation_stopped.get()
                    && let Some(format) = listener_state.borrow().negotiated
                {
                    send_ready_ok(&listener_ready, format);
                }
            }
            pw::stream::StreamState::Streaming => {
                if listener_state.borrow().negotiated.is_some()
                    && !listener_negotiation_stopped.replace(true)
                    && let Err(error) = stream.set_active(false)
                {
                    let diagnostic = error.to_string();
                    set_fatal(&listener_state.borrow().fatal, pipewire_error(error));
                    send_ready_error(&listener_ready, pipewire_error(diagnostic));
                    listener_loop.quit();
                }
            }
            _ => {}
        })
        .param_changed({
            let state = state.clone();
            let ready = ready.clone();
            move |stream, _, id, param| {
                if id != ParamType::Format.as_raw() {
                    return;
                }
                match apply_format_event(stream, param) {
                    Ok(FormatParamEvent::Ready(format)) => {
                        let mut process_state = state.borrow_mut();
                        process_state.dmabuf_importer.clear();
                        process_state.last_frame_geometry = None;
                        process_state.native_cursor.clear_frame();
                        process_state.negotiated = Some(format);
                        drop(process_state);
                        if matches!(stream.state(), pw::stream::StreamState::Paused) {
                            if format_negotiation_stopped.get() {
                                send_ready_ok(&ready, format);
                            }
                        } else if matches!(stream.state(), pw::stream::StreamState::Streaming)
                            && !format_negotiation_stopped.replace(true)
                            && let Err(error) = stream.set_active(false)
                        {
                            let diagnostic = error.to_string();
                            set_fatal(&state.borrow().fatal, pipewire_error(error));
                            send_ready_error(&ready, pipewire_error(diagnostic));
                            format_loop.quit();
                        }
                    }
                    Ok(FormatParamEvent::Cleared | FormatParamEvent::Fixating) => {
                        // A null format clears negotiation; wait for the next concrete format.
                        let mut process_state = state.borrow_mut();
                        process_state.negotiated = None;
                        process_state.dmabuf_importer.clear();
                        process_state.last_frame_geometry = None;
                        process_state.native_cursor.clear_frame();
                    }
                    Err(error) => {
                        let diagnostic = error.to_string();
                        set_fatal(&state.borrow().fatal, error);
                        send_ready_error(&ready, format_error(diagnostic));
                        format_loop.quit();
                    }
                }
            }
        })
        .process({
            let state = state.clone();
            move |stream, _| process_buffer(stream, &state)
        })
        .register()
        .map_err(pipewire_error)?;
    let command_stream = stream.downgrade();
    let command_state = state.clone();
    let command_loop = mainloop.clone();
    let attached = commands.attach(mainloop.loop_(), move |command| {
        let Some(stream) = command_stream.upgrade() else {
            command_loop.quit();
            return;
        };
        match command {
            PipewireCommand::Start {
                start_ns,
                start_gate,
                reply,
            } => {
                let mut state = command_state.borrow_mut();
                state.timestamp = TimestampMapper::new(start_ns);
                state.last_frame_geometry = None;
                state.native_cursor.clear_frame();
                state.start_gate = start_gate;
                state.active = true;
                let result = stream.set_active(true).map_err(pipewire_error);
                if let Err(error) = &result {
                    set_fatal(&state.fatal, pipewire_error(error));
                }
                if result.is_ok() {
                    state.start_reply = Some(reply);
                } else {
                    let _ = reply.send(result);
                }
            }
            PipewireCommand::Pause { reply } => {
                let mut state = command_state.borrow_mut();
                state.active = false;
                flush_pending_cursor(&mut state);
                let result = stream
                    .set_active(false)
                    .and_then(|()| stream.flush(false))
                    .map_err(pipewire_error);
                if let Err(error) = &result {
                    set_fatal(&state.fatal, pipewire_error(error));
                }
                let _ = reply.send(result);
            }
            PipewireCommand::Stop => {
                let mut state = command_state.borrow_mut();
                state.active = false;
                state.stopping = true;
                flush_pending_cursor(&mut state);
                drop(state);
                let _ = stream.set_active(false);
                let _ = stream.disconnect();
                command_loop.quit();
            }
        }
    });
    let format_bytes = [format_parameter()?, dma_buf_format_parameter()?];
    let mut params = format_bytes
        .iter()
        .map(|bytes| {
            Pod::from_bytes(bytes)
                .ok_or_else(|| format_error("failed to build PipeWire format parameter"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    stream
        .connect(
            spa::utils::Direction::Input,
            Some(node_id),
            pw::stream::StreamFlags::AUTOCONNECT | pw::stream::StreamFlags::MAP_BUFFERS,
            &mut params,
        )
        .map_err(pipewire_error)?;
    mainloop.run();
    drop(attached);
    drop(listener);
    let state = state.borrow_mut();
    if state.pending_drops > 0 {
        let _ = state
            .sink
            .send(SinkMessage::Discontinuity(backpressure_event(
                state.pending_drops,
                start_ns,
            )));
    }
    Ok(())
}
