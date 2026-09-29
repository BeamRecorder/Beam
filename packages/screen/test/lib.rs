#![allow(clippy::unwrap_used, clippy::expect_used)]
mod discovery;
mod gate;
mod source;
mod source_types;
mod telemetry;
#[test]
fn native_source_is_send_and_uses_shared_gate() {
    fn require_send<T: Send>() {}
    require_send::<beam_screen::ScreenCapture>();
}
mod clock;
mod cursor;
mod error;
mod input;
#[path = "bin/beam-input-helper.rs"]
mod input_helper_cli;
#[cfg(target_os = "linux")]
#[path = "screen/linux/capabilities.rs"]
mod linux_capabilities;
#[path = "screen/mac/catalog_policy.rs"]
mod mac_catalog_policy;
mod model;
#[path = "screen/frame.rs"]
mod screen_frame;
#[path = "screen/recording.rs"]
mod screen_metrics;
#[path = "screen/source_geometry.rs"]
mod screen_source_geometry;

#[cfg(target_os = "linux")]
#[path = "screen/linux/mod.rs"]
mod linux_api;
#[cfg(target_os = "linux")]
mod screen;
