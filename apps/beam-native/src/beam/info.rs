//! Application identity and diagnostic data exposed by the native host.

use super::types::{ApplicationInfo, PackageMetadata};
use crate::{ServiceRegistry, json};

/// Registers real application metadata without starting capture or probing devices.
pub(super) fn register(registry: &ServiceRegistry) {
    registry.register("beam", "info", |_| json::respond(application_info()));
}

/// Reads the build's embedded package version and the current OS environment.
///
/// # Errors
/// Returns the embedded package's JSON decoding error if its metadata is invalid.
pub(super) fn application_info() -> Result<ApplicationInfo, String> {
    let package: PackageMetadata = json::parse(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../package.json"
    )))?;
    Ok(ApplicationInfo {
        version: package.version,
        operating_system: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        logical_processors: std::thread::available_parallelism().map_or(1, usize::from),
        desktop_session: std::env::var("XDG_SESSION_TYPE")
            .ok()
            .filter(|value| !value.is_empty()),
    })
}
