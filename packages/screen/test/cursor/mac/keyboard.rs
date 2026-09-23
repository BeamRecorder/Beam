#![cfg(test)]

use super::{key_code, modifier_codes};
use crate::input::{InputKey, InputModifier};

#[test]
fn mac_shortcut_mapping_uses_left_and_right_modifiers_and_native_virtual_keys() {
    assert_eq!(modifier_codes(InputModifier::Control), [0x3b, 0x3e]);
    assert_eq!(modifier_codes(InputModifier::Shift), [0x38, 0x3c]);
    assert_eq!(modifier_codes(InputModifier::Alt), [0x3a, 0x3d]);
    assert_eq!(modifier_codes(InputModifier::Meta), [0x37, 0x36]);
    assert_eq!(key_code(InputKey::A), 0x00);
    assert_eq!(key_code(InputKey::Escape), 0x35);
    assert_eq!(key_code(InputKey::ArrowUp), 0x7e);
    assert_eq!(key_code(InputKey::F12), 0x6f);
}
