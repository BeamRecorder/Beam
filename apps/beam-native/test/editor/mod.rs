//! Native editor boundary checks without starting a window or physical devices.
#[allow(dead_code)]
#[path = "../../src/editor/files.rs"]
mod files;
#[allow(dead_code)]
#[path = "../../src/editor/project_types.rs"]
mod project_types;
#[allow(dead_code)]
#[path = "../../src/editor/session.rs"]
mod session;
#[allow(dead_code)]
#[path = "../../src/editor/types.rs"]
mod types;
#[allow(dead_code)]
#[path = "../../src/editor/window.rs"]
mod window;

#[path = "session.rs"]
mod session_checks;

#[path = "types.rs"]
mod payload_checks;
#[path = "files.rs"]
mod project_checks;
#[path = "window.rs"]
mod window_checks;

mod video;
