use super::{DesktopCapabilities, DesktopOptions};

#[test]
fn desktop_options_deserialize_camel_case_and_reject_unknown_fields() {
    let options: DesktopOptions =
        serde_json::from_str(r#"{"hideTaskbar":true,"hideDesktopIcons":false}"#).unwrap();
    assert!(options.hide_taskbar);
    assert!(!options.hide_desktop_icons);
    assert!(
        serde_json::from_str::<DesktopOptions>(
            r#"{"hideTaskbar":false,"hideDesktopIcons":false,"unknown":true}"#
        )
        .is_err()
    );
}

#[test]
fn missing_or_wrongly_typed_desktop_choices_are_not_silently_enabled() {
    for value in [
        r#"{}"#,
        r#"{"hideTaskbar":true}"#,
        r#"{"hideTaskbar":"true","hideDesktopIcons":false}"#,
    ] {
        assert!(serde_json::from_str::<DesktopOptions>(value).is_err());
    }
    let options = DesktopOptions::default();
    assert!(!options.hide_taskbar && !options.hide_desktop_icons);
}

#[test]
fn native_capabilities_keep_capture_only_separate_from_desktop_visibility() {
    let value = serde_json::to_value(DesktopCapabilities {
        taskbar: true,
        desktop_icons: false,
        capture_only: true,
    })
    .unwrap();
    assert_eq!(
        value,
        serde_json::json!({"taskbar":true,"desktopIcons":false,"captureOnly":true})
    );
    assert_eq!(
        serde_json::to_value(DesktopCapabilities::default()).unwrap(),
        serde_json::json!({"taskbar":false,"desktopIcons":false,"captureOnly":false})
    );
}
