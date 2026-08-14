use core_graphics::event_source::CGEventSourceStateID;

use crate::input::{InputKey, InputModifier};

#[must_use]
pub fn input_access_granted() -> bool {
    // SAFETY: CoreGraphics owns the permission state and receives no caller pointer.
    unsafe { CGPreflightListenEventAccess() }
}

pub fn request_input_access() -> bool {
    // SAFETY: CoreGraphics owns the permission prompt and receives no caller pointer.
    input_access_granted() || unsafe { CGRequestListenEventAccess() }
}

#[must_use]
pub(crate) fn shortcut_modifier_pressed(modifier: InputModifier) -> bool {
    let keys = match modifier {
        InputModifier::Control => [0x3b, 0x3e],
        InputModifier::Shift => [0x38, 0x3c],
        InputModifier::Alt => [0x3a, 0x3d],
        InputModifier::Meta => [0x37, 0x36],
    };
    keys.into_iter().any(key_state)
}

#[must_use]
pub(crate) fn shortcut_key_pressed(key: InputKey) -> bool {
    key_state(match key {
        InputKey::A => 0x00,
        InputKey::B => 0x0b,
        InputKey::C => 0x08,
        InputKey::D => 0x02,
        InputKey::E => 0x0e,
        InputKey::F => 0x03,
        InputKey::G => 0x05,
        InputKey::H => 0x04,
        InputKey::I => 0x22,
        InputKey::J => 0x26,
        InputKey::K => 0x28,
        InputKey::L => 0x25,
        InputKey::M => 0x2e,
        InputKey::N => 0x2d,
        InputKey::O => 0x1f,
        InputKey::P => 0x23,
        InputKey::Q => 0x0c,
        InputKey::R => 0x0f,
        InputKey::S => 0x01,
        InputKey::T => 0x11,
        InputKey::U => 0x20,
        InputKey::V => 0x09,
        InputKey::W => 0x0d,
        InputKey::X => 0x07,
        InputKey::Y => 0x10,
        InputKey::Z => 0x06,
        InputKey::Digit0 => 0x1d,
        InputKey::Digit1 => 0x12,
        InputKey::Digit2 => 0x13,
        InputKey::Digit3 => 0x14,
        InputKey::Digit4 => 0x15,
        InputKey::Digit5 => 0x17,
        InputKey::Digit6 => 0x16,
        InputKey::Digit7 => 0x1a,
        InputKey::Digit8 => 0x1c,
        InputKey::Digit9 => 0x19,
        InputKey::ArrowUp => 0x7e,
        InputKey::ArrowDown => 0x7d,
        InputKey::ArrowLeft => 0x7b,
        InputKey::ArrowRight => 0x7c,
        InputKey::Escape => 0x35,
        InputKey::Enter => 0x24,
        InputKey::Tab => 0x30,
        InputKey::Backspace => 0x33,
        InputKey::Delete => 0x75,
        InputKey::Insert => 0x72,
        InputKey::Home => 0x73,
        InputKey::End => 0x77,
        InputKey::PageUp => 0x74,
        InputKey::PageDown => 0x79,
        InputKey::Space => 0x31,
        InputKey::F1 => 0x7a,
        InputKey::F2 => 0x78,
        InputKey::F3 => 0x63,
        InputKey::F4 => 0x76,
        InputKey::F5 => 0x60,
        InputKey::F6 => 0x61,
        InputKey::F7 => 0x62,
        InputKey::F8 => 0x64,
        InputKey::F9 => 0x65,
        InputKey::F10 => 0x6d,
        InputKey::F11 => 0x67,
        InputKey::F12 => 0x6f,
    })
}

fn key_state(key: u16) -> bool {
    // SAFETY: CoreGraphics accepts any virtual key code and reads no caller-owned memory.
    unsafe { CGEventSourceKeyState(CGEventSourceStateID::CombinedSessionState, key) }
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
    fn CGEventSourceKeyState(state: CGEventSourceStateID, key: u16) -> bool;
}
