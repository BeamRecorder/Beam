//! Platform-neutral, non-destructive editing library. No UI or media backend dependency.
pub mod animation;
pub mod collections;
pub mod commands;
pub mod effects;
pub mod project;
pub mod recording;
pub mod shared;
pub mod timeline;
pub mod timing;
pub use project::types::*;
pub use shared::{EditorError, Result};
pub use timeline::types::*;
pub mod protocol;
