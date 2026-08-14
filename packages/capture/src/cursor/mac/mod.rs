mod appkit;
mod keyboard;
mod recording;

pub use keyboard::{input_access_granted, request_input_access};
pub(crate) use keyboard::{shortcut_key_pressed, shortcut_modifier_pressed};
pub use recording::*;
