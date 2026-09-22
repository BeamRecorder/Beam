mod capabilities;
mod cursor_buttons;
mod cursor_fusion;
mod diagnostics;
mod ffmpeg;
mod ffmpeg_cache;
mod ffmpeg_encoder;
mod ffmpeg_process;
#[path = "../../../test/screen/linux/ffmpeg_process.rs"]
mod ffmpeg_process_checks;
mod ffmpeg_sink;
mod gpu_inventory;
mod input_helper_diagnostics;
#[path = "../../../test/screen/linux/input_helper_diagnostics.rs"]
mod input_helper_diagnostics_checks;
mod input_helper_executable;
#[path = "../../../test/screen/linux/input_helper_executable.rs"]
mod input_helper_executable_checks;
mod input_monitor;
#[path = "../../../test/screen/linux/input_monitor.rs"]
mod input_monitor_checks;
mod input_timeline;
mod owned_child;
mod pipewire;
mod portal;
mod recording;
mod runtime;

pub use capabilities::*;
pub(crate) use diagnostics::*;
pub(crate) use ffmpeg::*;
pub(crate) use ffmpeg_encoder::*;
pub(crate) use ffmpeg_sink::*;
pub(crate) use input_monitor::{LinuxInputMonitor, input_helper_supported};
pub use input_monitor::{
    linux_input_access_status, request_linux_input_access, shutdown_linux_input_access,
};
pub(crate) use owned_child::terminate_all as terminate_owned_descendants;
pub use recording::*;
