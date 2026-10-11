use std::{
    fs::{File, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

use crate::CaptureError;

/// Owns an unpublished file, including cleanup on serialization or I/O failure.
/// Large sidecars can be streamed without first materializing their JSON bytes.
pub(crate) struct StagedFile {
    path: PathBuf,
    destination: PathBuf,
    writer: Option<BufWriter<File>>,
}

impl StagedFile {
    pub(crate) fn new(destination: &Path) -> Result<Self, CaptureError> {
        let name = destination.file_name().ok_or_else(|| {
            CaptureError::InvalidConfiguration("atomic path has no filename".into())
        })?;
        let path = destination.with_file_name(format!(
            "{}.{}.tmp",
            name.to_string_lossy(),
            uuid::Uuid::now_v7()
        ));
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options
            .open(&path)
            .map_err(|error| CaptureError::storage(&path, error))?;
        Ok(Self {
            path,
            destination: destination.into(),
            writer: Some(BufWriter::new(file)),
        })
    }

    pub(crate) fn writer(&mut self) -> Result<&mut BufWriter<File>, CaptureError> {
        self.writer
            .as_mut()
            .ok_or_else(|| CaptureError::Backend("staged file is already sealed".into()))
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn seal(&mut self) -> Result<(), CaptureError> {
        if let Some(mut writer) = self.writer.take() {
            writer
                .flush()
                .and_then(|()| writer.get_ref().sync_all())
                .map_err(|error| CaptureError::storage(&self.path, error))?;
        }
        Ok(())
    }

    pub(crate) fn publish(mut self) -> Result<(), CaptureError> {
        self.seal()?;
        std::fs::rename(&self.path, &self.destination)
            .map_err(|error| CaptureError::storage(&self.destination, error))?;
        let parent = self
            .destination
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        if let Err(error) = File::open(parent).and_then(|directory| directory.sync_all())
            && !matches!(
                error.kind(),
                std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
            )
        {
            return Err(CaptureError::storage(parent, error));
        }
        Ok(())
    }
}

impl Drop for StagedFile {
    fn drop(&mut self) {
        self.writer.take();
        let _ = std::fs::remove_file(&self.path);
    }
}
