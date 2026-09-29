//! Non-destructive Beam projects, native NLE playback, and GStreamer exports.
pub mod export;
pub mod project;
pub use beam_editor_domain::{shared, timeline};
pub mod video;

pub use project::types::*;
pub use shared::{EditorError, Result};
pub use timeline::types::*;
pub use video::controller::EditorController;
pub use video::types::{EditorSnapshot, PreviewFrame, Transport};
pub mod broker;
pub mod service;
pub use beam_editor_domain as domain;
