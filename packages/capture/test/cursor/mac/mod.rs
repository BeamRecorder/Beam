#![cfg(test)]

use crate::input::{InputKey, InputModifier};

#[test]
fn mac_cursor_facade_exposes_shortcut_queries() {
    let _: fn(InputKey) -> bool = super::shortcut_key_pressed;
    let _: fn(InputModifier) -> bool = super::shortcut_modifier_pressed;
    let _: fn() -> bool = super::input_access_granted;
}
