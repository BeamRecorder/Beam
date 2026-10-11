mod capture;
mod catalog;
mod compatibility;
mod encoder;
mod encoder_surface;
mod permissions;
mod selection;

pub use capture::*;
pub use catalog::*;
pub use permissions::*;
pub use selection::preview_window_selection;

mod screenshot;
pub(crate) use screenshot::capture_screenshot;

pub(crate) mod desktop_visibility;
