//! Renderer configuration for the native UI host.

use argui_render::BlurAlgorithm;

/// Returns the optional blur algorithm used by Beam's ARGUI host.
pub(super) fn gallery_blur_algorithm() -> BlurAlgorithm {
    match std::env::var("ARGUI_GALLERY_BLUR").as_deref() {
        Ok("gaussian") => BlurAlgorithm::Gaussian,
        Ok("dual") => BlurAlgorithm::DualKawase,
        _ => BlurAlgorithm::Auto,
    }
}
