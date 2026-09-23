use evdev::{AbsoluteAxisCode, AttributeSetRef, Device, KeyCode, PropType, RelativeAxisCode};

pub(super) fn supports_mouse(device: &Device) -> bool {
    supports_mouse_state(
        device.supported_keys(),
        device.supported_relative_axes(),
        device.supported_absolute_axes(),
        device.properties(),
    )
}

fn supports_mouse_state(
    keys: Option<&AttributeSetRef<KeyCode>>,
    relative: Option<&AttributeSetRef<RelativeAxisCode>>,
    absolute: Option<&AttributeSetRef<AbsoluteAxisCode>>,
    properties: &AttributeSetRef<PropType>,
) -> bool {
    let has_button = keys.is_some_and(|keys| {
        [
            KeyCode::BTN_LEFT,
            KeyCode::BTN_RIGHT,
            KeyCode::BTN_MIDDLE,
            KeyCode::BTN_SIDE,
            KeyCode::BTN_EXTRA,
        ]
        .into_iter()
        .any(|button| keys.contains(button))
    });
    let has_relative_motion = relative.is_some_and(|axes| {
        axes.contains(RelativeAxisCode::REL_X) && axes.contains(RelativeAxisCode::REL_Y)
    });
    let has_absolute_motion = absolute.is_some_and(|axes| {
        axes.contains(AbsoluteAxisCode::ABS_X) && axes.contains(AbsoluteAxisCode::ABS_Y)
    });
    supports_mouse_capabilities(
        has_button,
        has_relative_motion,
        has_absolute_motion,
        properties.contains(PropType::POINTER),
        properties.contains(PropType::DIRECT),
    )
}

fn supports_mouse_capabilities(
    has_button: bool,
    has_relative_motion: bool,
    has_absolute_motion: bool,
    is_pointer: bool,
    is_direct: bool,
) -> bool {
    has_button || has_relative_motion || (has_absolute_motion && is_pointer && !is_direct)
}

pub(super) fn supports_shortcuts(device: &Device) -> bool {
    supports_shortcut_keys(device.supported_keys())
}

fn supports_shortcut_keys(keys: Option<&AttributeSetRef<KeyCode>>) -> bool {
    keys.is_some_and(|keys| {
        keys.contains(KeyCode::KEY_LEFTCTRL)
            || keys.contains(KeyCode::KEY_RIGHTCTRL)
            || keys.contains(KeyCode::KEY_LEFTALT)
            || keys.contains(KeyCode::KEY_RIGHTALT)
            || keys.contains(KeyCode::KEY_LEFTMETA)
            || keys.contains(KeyCode::KEY_RIGHTMETA)
    })
}

#[path = "../../../test/bin/beam_input_helper/device.rs"]
mod device_checks;
