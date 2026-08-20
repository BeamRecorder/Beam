use std::{
    os::fd::OwnedFd,
    sync::mpsc,
    thread::{self, JoinHandle},
};

use ashpd::desktop::{
    PersistMode,
    screencast::{
        CursorMode, OpenPipeWireRemoteOptions, Screencast, SelectSourcesOptions, SourceType,
        StartCastOptions,
    },
};
use futures_util::StreamExt;

use crate::{
    CaptureError, NativeCaptureErrorCode,
    model::{CursorSelection, PortalSourceKind},
};

pub(super) struct PreparedPortal {
    remote_fd: Option<OwnedFd>,
    pub node_id: u32,
    pub stream_id: Option<String>,
    pub source_type: Option<SourceType>,
    control: PortalControl,
}

impl PreparedPortal {
    pub(super) fn take_remote_fd(&mut self) -> Result<OwnedFd, CaptureError> {
        self.remote_fd.take().ok_or_else(|| {
            CaptureError::native(
                NativeCaptureErrorCode::PipewireConnectFailed,
                "the Portal PipeWire remote fd was already consumed",
            )
        })
    }

    pub(super) fn close(&mut self) -> Result<(), CaptureError> {
        self.control.close()
    }

    pub(super) fn is_available(&self) -> bool {
        self.control.is_available()
    }
}

enum PortalCommand {
    Close,
}

struct PortalReady {
    remote_fd: OwnedFd,
    node_id: u32,
    stream_id: Option<String>,
    source_type: Option<SourceType>,
}

struct PortalControl {
    commands: Option<tokio::sync::mpsc::UnboundedSender<PortalCommand>>,
    thread: Option<JoinHandle<Result<(), CaptureError>>>,
}

impl PortalControl {
    fn close(&mut self) -> Result<(), CaptureError> {
        if let Some(commands) = self.commands.take() {
            let _ = commands.send(PortalCommand::Close);
        }
        self.thread.take().map_or(Ok(()), |thread| {
            thread.join().map_err(|_| {
                CaptureError::native(
                    NativeCaptureErrorCode::PortalSessionClosed,
                    "ScreenCast portal worker panicked",
                )
            })?
        })
    }

    fn is_available(&self) -> bool {
        self.thread
            .as_ref()
            .is_none_or(|thread| !thread.is_finished())
    }
}

impl Drop for PortalControl {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

pub(super) fn prepare_portal(
    kind: PortalSourceKind,
    cursor: CursorSelection,
) -> Result<PreparedPortal, CaptureError> {
    let (commands, receiver) = tokio::sync::mpsc::unbounded_channel();
    let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
    let thread = thread::Builder::new()
        .name("beam-linux-portal".into())
        .spawn(move || portal_worker(kind, cursor, receiver, ready_sender))
        .map_err(|error| {
            CaptureError::native(NativeCaptureErrorCode::PortalUnavailable, error.to_string())
        })?;
    let ready = match ready_receiver.recv() {
        Ok(result) => match result {
            Ok(ready) => ready,
            Err(error) => {
                let _ = commands.send(PortalCommand::Close);
                let _ = thread.join();
                return Err(error);
            }
        },
        Err(_) => {
            let _ = commands.send(PortalCommand::Close);
            let _ = thread.join();
            return Err(CaptureError::native(
                NativeCaptureErrorCode::PortalUnavailable,
                "ScreenCast portal worker exited before preparation completed",
            ));
        }
    };
    Ok(PreparedPortal {
        remote_fd: Some(ready.remote_fd),
        node_id: ready.node_id,
        stream_id: ready.stream_id,
        source_type: ready.source_type,
        control: PortalControl {
            commands: Some(commands),
            thread: Some(thread),
        },
    })
}

fn portal_worker(
    kind: PortalSourceKind,
    cursor: CursorSelection,
    commands: tokio::sync::mpsc::UnboundedReceiver<PortalCommand>,
    ready: mpsc::SyncSender<Result<PortalReady, CaptureError>>,
) -> Result<(), CaptureError> {
    let runtime = super::runtime::portal_runtime()?;
    runtime.block_on(portal_task(kind, cursor, commands, ready))
}

async fn portal_task(
    kind: PortalSourceKind,
    cursor: CursorSelection,
    mut commands: tokio::sync::mpsc::UnboundedReceiver<PortalCommand>,
    ready: mpsc::SyncSender<Result<PortalReady, CaptureError>>,
) -> Result<(), CaptureError> {
    let result = prepare(kind, cursor).await;
    let (proxy, session, portal_ready) = match result {
        Ok(prepared) => prepared,
        Err(error) => {
            let _ = ready.send(Err(error));
            return Ok(());
        }
    };
    ready.send(Ok(portal_ready)).map_err(|_| {
        CaptureError::native(
            NativeCaptureErrorCode::PortalSessionClosed,
            "portal preparation receiver was closed",
        )
    })?;
    let mut closed = session.receive_closed().await.map_err(map_portal_error)?;
    tokio::select! {
        command = commands.recv() => {
            if matches!(command, Some(PortalCommand::Close)) {
                session.close().await.map_err(map_portal_error)?;
            }
        }
        _ = closed.next() => {
            return Err(CaptureError::native(
                NativeCaptureErrorCode::PortalSessionClosed,
                "the ScreenCast portal closed the capture session",
            ));
        }
    }
    drop(proxy);
    Ok(())
}

async fn prepare(
    kind: PortalSourceKind,
    cursor: CursorSelection,
) -> Result<(Screencast, ashpd::desktop::Session<Screencast>, PortalReady), CaptureError> {
    let proxy = Screencast::new().await.map_err(map_portal_error)?;
    if proxy.version() < 2 {
        return Err(CaptureError::native(
            NativeCaptureErrorCode::PortalVersionUnsupported,
            format!(
                "ScreenCast portal version {} does not support cursor modes",
                proxy.version()
            ),
        ));
    }
    verify_capabilities(&proxy, kind.clone(), cursor).await?;
    let session = proxy
        .create_session(Default::default())
        .await
        .map_err(map_portal_error)?;
    let ready = match prepare_session(&proxy, &session, kind, cursor).await {
        Ok(ready) => ready,
        Err(error) => {
            let _ = session.close().await;
            return Err(error);
        }
    };
    Ok((proxy, session, ready))
}

async fn prepare_session(
    proxy: &Screencast,
    session: &ashpd::desktop::Session<Screencast>,
    kind: PortalSourceKind,
    cursor: CursorSelection,
) -> Result<PortalReady, CaptureError> {
    let request = proxy
        .select_sources(
            session,
            SelectSourcesOptions::default()
                .set_sources(source_type(kind))
                .set_multiple(false)
                .set_cursor_mode(cursor_mode(cursor))
                .set_persist_mode(PersistMode::DoNot),
        )
        .await
        .map_err(map_portal_error)?;
    request.response().map_err(map_portal_error)?;
    let request = proxy
        .start(session, None, StartCastOptions::default())
        .await
        .map_err(map_portal_error)?;
    let response = request.response().map_err(map_portal_error)?;
    let [stream] = response.streams() else {
        return Err(CaptureError::native(
            NativeCaptureErrorCode::PortalInvalidStreamResponse,
            format!(
                "the ScreenCast portal returned {} streams; exactly one is required",
                response.streams().len()
            ),
        ));
    };
    let remote_fd = proxy
        .open_pipe_wire_remote(session, OpenPipeWireRemoteOptions::default())
        .await
        .map_err(map_portal_error)?;
    Ok(PortalReady {
        remote_fd,
        node_id: stream.pipe_wire_node_id(),
        stream_id: stream.id().map(ToOwned::to_owned),
        source_type: stream.source_type(),
    })
}

async fn verify_capabilities(
    proxy: &Screencast,
    kind: PortalSourceKind,
    cursor: CursorSelection,
) -> Result<(), CaptureError> {
    let sources = proxy
        .available_source_types()
        .await
        .map_err(map_portal_error)?;
    let requested = source_type(kind);
    if !requested.iter().any(|source| sources.contains(source)) {
        return Err(CaptureError::native(
            NativeCaptureErrorCode::PortalVersionUnsupported,
            "the ScreenCast portal does not advertise the requested source type",
        ));
    }
    let modes = proxy
        .available_cursor_modes()
        .await
        .map_err(map_portal_error)?;
    let requested_cursor = cursor_mode(cursor);
    if !modes.contains(requested_cursor) {
        return Err(CaptureError::native(
            NativeCaptureErrorCode::PortalCursorMetadataUnavailable,
            format!("the ScreenCast portal does not advertise cursor mode {requested_cursor:?}"),
        ));
    }
    Ok(())
}

fn source_type(kind: PortalSourceKind) -> ashpd::enumflags2::BitFlags<SourceType> {
    match kind {
        PortalSourceKind::Monitor => SourceType::Monitor.into(),
        PortalSourceKind::Window => SourceType::Window.into(),
        PortalSourceKind::MonitorOrWindow => SourceType::Monitor | SourceType::Window,
    }
}

fn cursor_mode(cursor: CursorSelection) -> CursorMode {
    match cursor {
        CursorSelection::Disabled => CursorMode::Hidden,
        CursorSelection::Embedded => CursorMode::Embedded,
        CursorSelection::Separate { .. } => CursorMode::Metadata,
    }
}

fn map_portal_error(error: ashpd::Error) -> CaptureError {
    let code = match error {
        ashpd::Error::Response(ashpd::desktop::ResponseError::Cancelled)
        | ashpd::Error::Portal(ashpd::PortalError::Cancelled(_)) => {
            NativeCaptureErrorCode::PortalCancelled
        }
        ashpd::Error::Response(ashpd::desktop::ResponseError::Other)
        | ashpd::Error::Portal(ashpd::PortalError::NotAllowed(_)) => {
            NativeCaptureErrorCode::PortalDenied
        }
        ashpd::Error::RequiresVersion(_, _) => NativeCaptureErrorCode::PortalVersionUnsupported,
        ashpd::Error::PortalNotFound(_) => NativeCaptureErrorCode::PortalUnavailable,
        _ => NativeCaptureErrorCode::PortalUnavailable,
    };
    CaptureError::native(code, error.to_string())
}
