mod apartment;
mod async_wait;
pub(crate) use apartment::RuntimeApartment;
mod capture;
mod capture_handler;
mod capture_health;
mod catalog;
mod compatibility;
mod encoder;
mod encoder_startup;
mod encoder_surface;
mod gpu_scale;
mod permissions;
mod readback;
mod sample_pump;
mod selection;

pub(crate) use capture::window_from_source_id;
pub use capture::*;
pub use catalog::*;
pub use permissions::*;
pub use selection::preview_window_selection;

mod screenshot;
pub(crate) use screenshot::capture_screenshot;

pub(crate) mod desktop_visibility;

#[cfg(all(test, feature = "hardware-tests"))]
mod test_support;
