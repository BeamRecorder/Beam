//! In-process native media control for hosts that do not own the capture loop.
//!
//! Four independent native tracks share one session clock and lifecycle.
mod backend;
mod controller;
mod error;
mod events;
mod output;
mod types;
mod worker;

pub use beam_media_manifest::{ProjectId, SessionId};
pub use beam_media_session::{AudioLevel, AudioLevels, AudioSelection, CameraSelection};
pub use controller::RecordingController;
pub use error::EngineError;
pub use types::*;

pub use beam_screen::model::{CursorSelection, PortalSourceKind, ScreenRegion, ScreenSelection};
pub use beam_screen::{ScreenPreview, ScreenRequest};

pub mod protocol;

pub mod process;

mod project;
