use super::window;

#[test]
fn editor_uses_an_opaque_resizable_native_window_with_useful_minimum_size() {
    let application = window::window_config().unwrap();
    assert!(!application.ui_zoom.enabled);
    let config = &application.windows[0];
    assert_eq!(config.window.width, 1440.);
    assert_eq!(config.window.height, 900.);
    assert_eq!(config.window.minimum_size, Some((720., 480.)));
    assert!(config.window.resizable && config.window.decorations);
    assert!(!config.window.transparent);
}
