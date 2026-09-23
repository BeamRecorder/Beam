mod capture;
mod catalog;
mod compatibility;
mod permissions;

pub use capture::*;
pub use catalog::*;
pub use permissions::*;

mod screenshot;
pub(crate) use screenshot::capture_screenshot;

#[path = "../../../test/screen/win/mod.rs"]
mod platform_checks;
