mod capabilities;
mod input_helper_diagnostics;
#[path = "../../../test/screen/linux/input_helper_diagnostics.rs"]
mod input_helper_diagnostics_checks;
mod input_helper_executable;
#[path = "../../../test/screen/linux/input_helper_executable.rs"]
mod input_helper_executable_checks;
mod input_monitor;
#[path = "../../../test/screen/linux/input_monitor.rs"]
mod input_monitor_checks;
pub(crate) mod input_timeline;
mod owned_child;
mod pipewire;
mod portal;
pub(crate) mod recording;
mod runtime;

pub use capabilities::*;
pub(crate) use input_monitor::{LinuxInputMonitor, input_helper_supported};
pub use input_monitor::{
    linux_input_access_status, request_linux_input_access, shutdown_linux_input_access,
};
pub use owned_child::terminate_all as terminate_owned_descendants;
pub use recording::*;
