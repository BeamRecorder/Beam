//! Keep one inode locked for the owner's lifetime, including socket cleanup.
use super::{endpoint, token_file};
use crate::{EditorError, Result};
use std::{
    fs::{self, File, Metadata, OpenOptions},
    io::ErrorKind,
    os::unix::{
        fs::{MetadataExt, OpenOptionsExt},
        net::UnixStream,
    },
    path::Path,
};

pub(super) fn acquire(socket: &Path) -> Result<File> {
    endpoint::private_directory(socket.parent().ok_or_else(|| {
        EditorError::Invalid("broker endpoint requires a parent directory".into())
    })?)?;
    let path = socket.with_extension("lock");
    present(&path, false)?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(&path)
        .map_err(|error| crate::shared::storage(&path, error))?;
    let opened = file
        .metadata()
        .map_err(|error| crate::shared::storage(&path, error))?;
    let current = present(&path, false)?
        .ok_or_else(|| EditorError::Unauthorized("broker lock disappeared while opening".into()))?;
    if !same_inode(&opened, &current) || current.nlink() != 1 {
        return Err(EditorError::Unauthorized(
            "broker lock must have one stable, private inode".into(),
        ));
    }
    fs2::FileExt::try_lock_exclusive(&file)
        .map_err(|error| crate::shared::storage(&path, error))?;
    Ok(file)
}

/// Called only while holding the exclusive lock. A live legacy listener also wins.
pub(super) fn recover(socket: &Path) -> Result<()> {
    let stale_socket = present(socket, true)?;
    let token = token_file(socket);
    let stale_token = present(&token, false)?;
    if let Some(metadata) = stale_socket {
        match UnixStream::connect(socket) {
            Ok(_) => {
                return Err(EditorError::Invalid(
                    "broker endpoint already has a live listener".into(),
                ));
            }
            Err(error) if error.kind() == ErrorKind::ConnectionRefused => {}
            Err(error) => return Err(crate::shared::storage(socket, error)),
        }
        remove_verified(socket, &metadata, true)?;
    }
    if let Some(metadata) = stale_token {
        remove_verified(&token, &metadata, false)?;
    }
    Ok(())
}

fn present(path: &Path, socket: bool) -> Result<Option<Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            endpoint::private_file(path, socket)?;
            Ok(Some(metadata))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(crate::shared::storage(path, error)),
    }
}

fn remove_verified(path: &Path, expected: &Metadata, socket: bool) -> Result<()> {
    let current = present(path, socket)?.ok_or_else(|| {
        EditorError::Unauthorized("broker file disappeared during recovery".into())
    })?;
    if !same_inode(expected, &current) {
        return Err(EditorError::Unauthorized(
            "broker file changed during recovery".into(),
        ));
    }
    fs::remove_file(path).map_err(|error| crate::shared::storage(path, error))
}

fn same_inode(first: &Metadata, second: &Metadata) -> bool {
    first.dev() == second.dev() && first.ino() == second.ino()
}
