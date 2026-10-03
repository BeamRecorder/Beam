mod capture;
mod catalog;
mod compatibility;
mod permissions;
mod selection;

pub use capture::*;
pub use catalog::*;
pub use permissions::*;
pub use selection::preview_window_selection;

mod screenshot;
pub(crate) use screenshot::capture_screenshot;

pub(crate) mod desktop_visibility;
