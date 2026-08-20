use std::{fs, os::unix::fs::PermissionsExt, path::Path};

pub(super) const INSTALLED_HELPER: &str = "/usr/libexec/beam-input-helper";
pub(super) const INSTALLED_POLICY: &str =
    "/usr/share/polkit-1/actions/com.beam.input-monitor.policy";
const POLICY: &str = include_str!("../beam-input-helper.policy");

pub(super) fn install_assets() -> Result<(), Box<dyn std::error::Error>> {
    // `/proc/self/exe` remains readable when this process was started from a
    // sealed memfd; `current_exe()` resolves to a non-openable
    // `/memfd:... (deleted)` target in that case.
    install_file(
        Path::new("/proc/self/exe"),
        Path::new(INSTALLED_HELPER),
        0o755,
    )?;
    install_bytes(POLICY.as_bytes(), Path::new(INSTALLED_POLICY), 0o644)
}

fn install_file(
    source: &Path,
    destination: &Path,
    mode: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    install_bytes(&fs::read(source)?, destination, mode)
}

fn install_bytes(
    bytes: &[u8],
    destination: &Path,
    mode: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    let parent = destination
        .parent()
        .ok_or("system helper destination has no parent directory")?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("beam-input-helper"),
        std::process::id()
    ));
    fs::write(&temporary, bytes)?;
    fs::set_permissions(&temporary, fs::Permissions::from_mode(mode))?;
    fs::rename(temporary, destination)?;
    Ok(())
}
