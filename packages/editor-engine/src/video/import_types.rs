//! Failed import candidates release only the new copies owned by that operation.
use std::{fs, path::PathBuf};
pub(crate) struct ImportedFiles {
    pub folder: PathBuf,
    pub paths: Vec<PathBuf>,
}
impl Drop for ImportedFiles {
    fn drop(&mut self) {
        if self.folder.symlink_metadata().map_or(true, |metadata| {
            !metadata.is_dir() || metadata.file_type().is_symlink()
        }) {
            return;
        }
        for path in &self.paths {
            if path.parent() != Some(self.folder.as_path()) {
                continue;
            }
            if let Err(error) = fs::remove_file(path)
                && error.kind() != std::io::ErrorKind::NotFound
            {
                eprintln!("failed import cleanup for {}: {error}", path.display());
            }
        }
    }
}
