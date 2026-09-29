//! GStreamer owns decoding, composition, audio mixing, and encoding.
mod command_types;
pub mod controller;
pub mod gpu;
pub mod pipeline;
pub mod preview;
pub mod probe;
pub mod seek;
pub(crate) mod thumbnail;
pub(crate) mod title;
pub mod types;
pub mod visuals;
pub mod worker;
pub mod zoom;
