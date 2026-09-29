//! Typed commands crossing the exclusive media actor boundary.
use super::types::{EditorSnapshot, PreviewQuality, Transport};
use crate::export::types::Container;
use crate::{Edit, Result};
use std::{path::PathBuf, sync::mpsc::Sender};

pub(super) enum Command {
    Open(PathBuf, Sender<Result<EditorSnapshot>>),
    Create(PathBuf, String, Sender<Result<EditorSnapshot>>),
    Edit(u64, Edit, Sender<Result<EditorSnapshot>>),
    Transaction(
        beam_editor_domain::commands::types::Transaction,
        Sender<Result<beam_editor_domain::commands::types::Receipt>>,
    ),
    ValidateTransaction(
        beam_editor_domain::commands::types::Transaction,
        Sender<Result<beam_editor_domain::commands::types::Receipt>>,
    ),
    Document(Sender<Result<crate::Document>>),
    ProjectRoot(Sender<Result<PathBuf>>),
    GarbageCollect(
        uuid::Uuid,
        u64,
        Vec<String>,
        Sender<Result<beam_editor_domain::project::gc_types::GarbageCollection>>,
    ),
    Import(Vec<PathBuf>, Sender<Result<EditorSnapshot>>),
    ImportPublication(
        beam_editor_domain::protocol::RenderContext,
        Vec<PathBuf>,
        Sender<Result<beam_editor_domain::commands::import_types::ImportPublication>>,
    ),
    PublishImport(
        PathBuf,
        beam_editor_domain::protocol::RenderContext,
        Box<beam_editor_domain::commands::import_types::PreparedImport>,
        std::sync::Arc<std::sync::atomic::AtomicBool>,
        Sender<Result<beam_editor_domain::commands::import_types::ImportPublication>>,
    ),
    Relink(
        beam_editor_domain::protocol::RenderContext,
        uuid::Uuid,
        Vec<uuid::Uuid>,
        PathBuf,
        Sender<Result<beam_editor_domain::commands::types::Receipt>>,
    ),
    Snapshot(Sender<Result<EditorSnapshot>>),
    Seek(u64, Sender<Result<Transport>>),
    Play(bool, Sender<Result<Transport>>),
    Retry(Sender<Result<EditorSnapshot>>),
    Quality(PreviewQuality, Sender<Result<EditorSnapshot>>),
    Source(String, Sender<Result<super::visuals::types::Source>>),
    Transport(Sender<Result<Transport>>),
    Export(PathBuf, Container, Sender<Result<()>>),
    Shutdown,
}
