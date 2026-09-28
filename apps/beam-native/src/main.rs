//! Desktop entry point for Beam's Solid interface.

/// Runs the Beam native window until the application exits.
///
/// # Errors
/// Returns an error if Beam startup or the native event loop fails.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    beam_native::run_desktop()
}
