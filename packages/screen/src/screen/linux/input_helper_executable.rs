use crate::CaptureError;
use std::{
    fs::{self, File, OpenOptions},
    io::{BufReader, Read},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::{OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
};

const INSTALLED_HELPER: &str = "/usr/libexec/beam-input-helper";
const INSTALLED_POLICY: &str = "/usr/share/polkit-1/actions/com.beam.input-monitor.policy";
const POLICY: &[u8] = include_bytes!("../../bin/beam-input-helper.policy");

pub(super) struct ElevatedHelperExecutable {
    path: PathBuf,
    _sealed_file: Option<File>,
}

pub(super) fn input_helper_path() -> Option<PathBuf> {
    bundled_input_helper_path().or_else(|| {
        let installed = PathBuf::from(INSTALLED_HELPER);
        executable_file(&installed).then_some(installed)
    })
}

fn bundled_input_helper_path() -> Option<PathBuf> {
    std::env::var_os("BEAM_INPUT_HELPER_PATH")
        .map(PathBuf::from)
        .filter(|path| executable_file(path))
}

pub(super) fn helper_launch() -> Result<(ElevatedHelperExecutable, &'static str), CaptureError> {
    let installed = PathBuf::from(INSTALLED_HELPER);
    if let Some(bundled) = bundled_input_helper_path()
        && bundled != installed
        && helper_needs_install(&bundled, &installed, Path::new(INSTALLED_POLICY))?
    {
        // A sealed copy remains readable across privilege elevation from AppImage's FUSE mount.
        return Ok((
            ElevatedHelperExecutable::from_bundled(&bundled)?,
            "install-stream",
        ));
    }
    executable_file(&installed)
        .then_some((ElevatedHelperExecutable::installed(installed), "stream"))
        .ok_or_else(|| CaptureError::Unsupported("Beam input helper is not installed".into()))
}

fn open_regular(path: &Path) -> Result<File, CaptureError> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(|error| CaptureError::storage(path, error))?;
    if !file
        .metadata()
        .map_err(|error| CaptureError::storage(path, error))?
        .is_file()
    {
        return Err(CaptureError::InvalidConfiguration(format!(
            "input helper is not a regular file: {}",
            path.display()
        )));
    }
    Ok(file)
}

pub(super) fn helper_needs_install(
    bundled: &Path,
    installed: &Path,
    installed_policy: &Path,
) -> Result<bool, CaptureError> {
    let source = open_regular(bundled)?;
    let destination = match open_regular(installed) {
        Ok(file) => file,
        Err(CaptureError::Storage { source, .. })
            if source.kind() == std::io::ErrorKind::NotFound =>
        {
            return Ok(true);
        }
        Err(error) => return Err(error),
    };
    let source_len = source
        .metadata()
        .map_err(|error| CaptureError::storage(bundled, error))?
        .len();
    let destination_metadata = destination
        .metadata()
        .map_err(|error| CaptureError::storage(installed, error))?;
    if source_len != destination_metadata.len()
        || destination_metadata.permissions().mode() & 0o111 == 0
    {
        return Ok(true);
    }
    let mut source = BufReader::new(source);
    let mut destination = BufReader::new(destination);
    let mut left = [0; 16 * 1024];
    let mut right = [0; 16 * 1024];
    loop {
        let count = source
            .read(&mut left)
            .map_err(|error| CaptureError::storage(bundled, error))?;
        if count == 0 {
            break;
        }
        if let Err(error) = destination.read_exact(&mut right[..count]) {
            if error.kind() == std::io::ErrorKind::UnexpectedEof {
                return Ok(true);
            }
            return Err(CaptureError::storage(installed, error));
        }
        if left[..count] != right[..count] {
            return Ok(true);
        }
    }
    if destination
        .read(&mut right[..1])
        .map_err(|error| CaptureError::storage(installed, error))?
        != 0
    {
        return Ok(true);
    }
    let policy = match open_regular(installed_policy) {
        Ok(file) => file,
        Err(CaptureError::Storage { source, .. })
            if source.kind() == std::io::ErrorKind::NotFound =>
        {
            return Ok(true);
        }
        Err(error) => return Err(error),
    };
    let mut policy_bytes = Vec::new();
    policy
        .take(POLICY.len() as u64 + 1)
        .read_to_end(&mut policy_bytes)
        .map_err(|error| CaptureError::storage(installed_policy, error))?;
    Ok(policy_bytes != POLICY)
}

pub(super) fn executable_file(path: &Path) -> bool {
    fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

pub(super) fn command_on_path(command: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|value| {
        std::env::split_paths(&value).any(|directory| executable_file(&directory.join(command)))
    })
}

impl ElevatedHelperExecutable {
    pub(super) fn installed(path: PathBuf) -> Self {
        Self {
            path,
            _sealed_file: None,
        }
    }

    pub(super) fn from_bundled(source: &Path) -> Result<Self, CaptureError> {
        let mut input = open_regular(source)?;

        // SAFETY: the C string is static and valid; memfd_create returns a new
        // owned descriptor or -1 without aliasing any Rust-managed resource.
        let descriptor = unsafe {
            libc::memfd_create(
                c"beam-input-helper".as_ptr(),
                libc::MFD_CLOEXEC | libc::MFD_ALLOW_SEALING,
            )
        };
        if descriptor < 0 {
            return Err(CaptureError::Backend(format!(
                "input helper memory file could not be created: {}",
                std::io::Error::last_os_error()
            )));
        }
        // SAFETY: descriptor was freshly returned by memfd_create and ownership
        // is transferred exactly once to File, which closes it on every exit.
        let mut sealed_file = unsafe { File::from_raw_fd(descriptor) };
        std::io::copy(&mut input, &mut sealed_file)
            .and_then(|_| sealed_file.sync_all())
            .map_err(|error| CaptureError::storage(source, error))?;
        // SAFETY: fchmod only mutates the mode of this owned descriptor.
        if unsafe { libc::fchmod(sealed_file.as_raw_fd(), 0o500) } != 0 {
            return Err(CaptureError::Backend(format!(
                "input helper memory permissions could not be set: {}",
                std::io::Error::last_os_error()
            )));
        }
        let seals =
            libc::F_SEAL_SEAL | libc::F_SEAL_SHRINK | libc::F_SEAL_GROW | libc::F_SEAL_WRITE;
        // SAFETY: fcntl applies immutable seals to this owned memfd descriptor.
        if unsafe { libc::fcntl(sealed_file.as_raw_fd(), libc::F_ADD_SEALS, seals) } != 0 {
            return Err(CaptureError::Backend(format!(
                "input helper memory file could not be sealed: {}",
                std::io::Error::last_os_error()
            )));
        }
        let path = PathBuf::from(format!(
            "/proc/{}/fd/{}",
            std::process::id(),
            sealed_file.as_raw_fd()
        ));
        Ok(Self {
            path,
            _sealed_file: Some(sealed_file),
        })
    }

    pub(super) fn path(&self) -> &Path {
        &self.path
    }
}
