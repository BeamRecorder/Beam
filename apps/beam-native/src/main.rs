//! Desktop entry point for Beam's Solid interface.

/// Runs the Beam native window until the application exits.
///
/// # Errors
/// Returns an error if Beam startup or the native event loop fails.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "linux")]
    {
        // The native GLSL effects use GLES syntax. Select it before any media or UI
        // thread can initialize GStreamer; explicit caller choices still win.
        if std::env::var_os("GST_GL_PLATFORM").is_none() {
            // SAFETY: This is the first operation in main, before starting any threads.
            unsafe { std::env::set_var("GST_GL_PLATFORM", "egl") };
        }
        if std::env::var_os("GST_GL_API").is_none() {
            // SAFETY: This is the first operation in main, before starting any threads.
            unsafe { std::env::set_var("GST_GL_API", "gles2") };
        }
    }
    beam_native::run_desktop()
}
