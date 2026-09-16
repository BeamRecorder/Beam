use evdev::{AbsoluteAxisCode, Device, KeyCode, PropType, RelativeAxisCode};

pub(super) fn supports_mouse(device: &Device) -> bool {
    let has_button = device.supported_keys().is_some_and(|keys| {
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
    let has_relative_motion = device.supported_relative_axes().is_some_and(|axes| {
        axes.contains(RelativeAxisCode::REL_X) && axes.contains(RelativeAxisCode::REL_Y)
    });
    let has_absolute_motion = device.supported_absolute_axes().is_some_and(|axes| {
        axes.contains(AbsoluteAxisCode::ABS_X) && axes.contains(AbsoluteAxisCode::ABS_Y)
    });
    let properties = device.properties();
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
    device.supported_keys().is_some_and(|keys| {
        keys.contains(KeyCode::KEY_LEFTCTRL)
            || keys.contains(KeyCode::KEY_RIGHTCTRL)
            || keys.contains(KeyCode::KEY_LEFTALT)
            || keys.contains(KeyCode::KEY_RIGHTALT)
            || keys.contains(KeyCode::KEY_LEFTMETA)
            || keys.contains(KeyCode::KEY_RIGHTMETA)
    })
}

#[cfg(test)]
mod tests {
    use super::supports_mouse_capabilities;

    #[test]
    fn accepts_button_and_relative_pointer_devices() {
        assert!(supports_mouse_capabilities(
            true, false, false, false, false
        ));
        assert!(supports_mouse_capabilities(
            false, true, false, false, false
        ));
    }

    #[test]
    fn accepts_absolute_indirect_pointer_devices() {
        assert!(supports_mouse_capabilities(false, false, true, true, false));
    }

    #[test]
    fn rejects_direct_touchscreens_and_non_pointer_absolute_devices() {
        assert!(!supports_mouse_capabilities(false, false, true, true, true));
        assert!(!supports_mouse_capabilities(
            false, false, true, false, false
        ));
    }
}
