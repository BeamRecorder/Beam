//! Bounded command boundary. GES objects remain on their exclusive worker thread.
use super::{
    preview::Frames,
    types::{EditorSnapshot, PreviewFrame, Transport},
    worker::{Command, run},
};
use crate::export::{
    render::Exporter,
    types::{Container, ExportStatus},
};
use crate::{Edit, EditorError, Result};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        mpsc::{self, SyncSender},
    },
    time::Duration,
};

pub struct EditorController {
    visuals: super::visuals::VisualWorker,
    commands: SyncSender<Command>,
    frames: Frames,
    exporter: Exporter,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl EditorController {
    /// Starts the exclusive editor actor; an idle actor is parked without a polling timer.
    pub fn new() -> Result<Self> {
        let (commands, receiver) = mpsc::sync_channel(16);
        let frames = Frames::default();
        let output = Arc::clone(&frames);
        let exporter = Exporter::default();
        let jobs = exporter.clone();
        let worker = std::thread::Builder::new()
            .name("beam-editor".into())
            .spawn(move || run(receiver, output, jobs))
            .map_err(|e| crate::shared::storage("editor worker", e))?;
        Ok(Self {
            visuals: super::visuals::VisualWorker::new()?,
            commands,
            frames,
            exporter,
            worker: Some(worker),
        })
    }
    /// Opens an existing native edit document or a manifest-authoritative recording.
    pub fn open(&self, root: PathBuf) -> Result<EditorSnapshot> {
        self.request(|reply| Command::Open(root, reply))
    }
    /// Creates an empty native project in a host-owned directory.
    pub fn create(&self, root: PathBuf, name: String) -> Result<EditorSnapshot> {
        self.request(|reply| Command::Create(root, name, reply))
    }
    /// Returns document metadata, history availability, and current transport state.
    pub fn snapshot(&self) -> Result<EditorSnapshot> {
        self.request(Command::Snapshot)
    }
    /// Rebuilds the current composition after a missing source or plugin is restored.
    pub fn retry(&self) -> Result<EditorSnapshot> {
        self.request(Command::Retry)
    }
    /// Rebuilds only the preview sampling level, preserving the edit history and sources.
    pub fn preview_quality(&self, quality: super::types::PreviewQuality) -> Result<EditorSnapshot> {
        self.request(|reply| Command::Quality(quality, reply))
    }
    /// Decodes one small, project-validated source thumbnail on the GES actor.
    pub fn thumbnail(&self, id: String) -> Result<PreviewFrame> {
        super::thumbnail::decode(&self.visuals, self.source(id)?)
    }
    /// Copies only the requested asset metadata; this never stops playback to decode artwork.
    pub fn source(&self, id: String) -> Result<super::visuals::types::Source> {
        self.request(|reply| Command::Source(id, reply))
    }
    pub fn source_visual(
        &self,
        source: super::visuals::types::Source,
        request: super::visuals::types::VisualRequest,
        cancel: super::visuals::types::Cancel,
        consumer: super::visuals::types::Consumer,
    ) -> Result<()> {
        self.visuals.submit(source, request, cancel, consumer)
    }
    /// Applies an optimistic revision-checked command, preventing stale UI writes.
    pub fn edit(&self, revision: u64, edit: Edit) -> Result<EditorSnapshot> {
        self.request(|reply| Command::Edit(revision, edit, reply))
    }
    /// Copies selected media and inserts it on a compatible lane as one history step.
    pub fn import(&self, paths: Vec<PathBuf>) -> Result<EditorSnapshot> {
        self.request(|reply| Command::Import(paths, reply))
    }
    /// Seeks the composed NLE timeline, never a guessed single source file.
    pub fn seek(&self, position_ms: u64) -> Result<Transport> {
        self.request(|reply| Command::Seek(position_ms, reply))
    }
    /// Changes the GStreamer playback state.
    pub fn play(&self, playing: bool) -> Result<Transport> {
        self.request(|reply| Command::Play(playing, reply))
    }
    /// Returns position without rebuilding document or cursor metadata.
    pub fn transport(&self) -> Result<Transport> {
        self.request(Command::Transport)
    }
    /// Takes the latest frame. A slow consumer drops old frames instead of delaying media.
    pub fn frame(&self) -> Option<PreviewFrame> {
        self.frames.take()
    }
    /// Registers a native viewport consumer. Raster bytes bypass the JSON service boundary.
    pub fn set_frame_consumer(&self, consumer: impl Fn(PreviewFrame) + Send + Sync + 'static) {
        *self
            .frames
            .consumer
            .lock()
            .unwrap_or_else(|p| p.into_inner()) = Some(Arc::new(consumer));
    }
    /// Selects the negotiated platform transport before importing/opening a composition.
    pub fn set_preview_transport(&self, transport: super::gpu::types::PreviewTransport) {
        *self
            .frames
            .transport
            .lock()
            .unwrap_or_else(|p| p.into_inner()) = transport;
    }
    /// Freezes the current composition only when an export is requested.
    pub fn export(&self, destination: PathBuf, container: Container) -> Result<()> {
        self.request(|reply| Command::Export(destination, container, reply))
    }
    pub fn export_status(&self) -> ExportStatus {
        self.exporter.status()
    }
    pub fn cancel_export(&self) {
        self.exporter.cancel();
    }
    fn request<T>(&self, command: impl FnOnce(mpsc::Sender<Result<T>>) -> Command) -> Result<T> {
        let (sender, receiver) = mpsc::channel();
        self.commands
            .try_send(command(sender))
            .map_err(|_| EditorError::Stopped)?;
        receiver
            .recv_timeout(Duration::from_secs(120))
            .map_err(|_| EditorError::Stopped)?
    }
}
impl Drop for EditorController {
    fn drop(&mut self) {
        self.exporter.cancel();
        let _ = self.commands.send(Command::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        self.exporter.join();
    }
}
