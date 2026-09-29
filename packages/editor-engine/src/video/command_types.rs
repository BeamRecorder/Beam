//! Typed commands crossing the exclusive media actor boundary.
use super::types::{EditorSnapshot, PreviewQuality, Transport};
use crate::export::types::Container;
use crate::{Edit, Result};
use std::{path::PathBuf, sync::mpsc::Sender};

pub(super) enum Command {
    Open(PathBuf, Sender<Result<EditorSnapshot>>),
    Create(PathBuf, String, Sender<Result<EditorSnapshot>>),
    Edit(u64, Edit, Sender<Result<EditorSnapshot>>),
    Import(Vec<PathBuf>, Sender<Result<EditorSnapshot>>),
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
