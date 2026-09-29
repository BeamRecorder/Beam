//! Native editor boundary checks without starting a window or physical devices.
#[allow(dead_code)]
#[path = "../../src/editor/files.rs"]
mod files;
#[allow(dead_code)]
#[path = "../../src/editor/types.rs"]
mod types;
#[allow(dead_code)]
#[path = "../../src/editor/window.rs"]
mod window;

#[path = "types.rs"]
mod payload_checks;
#[path = "files.rs"]
mod project_checks;
#[path = "window.rs"]
mod window_checks;

mod video;
