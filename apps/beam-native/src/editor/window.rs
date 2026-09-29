//! The native editor uses an opaque, resizable ordinary desktop window.
use argui_platform::{
    AppIcon, ApplicationConfig, ApplicationId, ApplicationIdentity, CloseBehavior, IconSet,
    WindowConfig,
};

/// Recognizes only native editor launch arguments, including explicit project paths.
pub(crate) fn is_editor() -> bool {
    std::env::args().any(|a| {
        a == "--editor" || a.starts_with("--editor=") || a.starts_with("--editor-project=")
    })
}
/// Creates a native NLE window independent from recorder HUD geometry and overlays.
pub(crate) fn window_config() -> Result<ApplicationConfig, Box<dyn std::error::Error>> {
    let identity = ApplicationIdentity::new(
        ApplicationId::new("app.beam.editor")?,
        "Beam Editor",
        IconSet::single(AppIcon::from_png(include_bytes!(
            "../../../../packages/beam-ui/assets/brand/tray.png"
        ))?),
    );
    Ok(ApplicationConfig::new(
        identity,
        WindowConfig {
            title: "Beam Editor".into(),
            width: 1440.,
            height: 900.,
            minimum_size: Some((720., 480.)),
            resizable: true,
            transparent: false,
            decorations: true,
            close_behavior: CloseBehavior::Quit,
            ..WindowConfig::default()
        },
    ))
}
