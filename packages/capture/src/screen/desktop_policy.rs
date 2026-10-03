#[cfg(any(test, target_os = "macos"))]
pub(crate) fn exclude_desktop_window(
    owner: &str,
    layer: i32,
    icon_layer: i32,
    hide_taskbar: bool,
    hide_icons: bool,
) -> bool {
    (hide_taskbar && owner == "com.apple.dock")
        || (hide_icons && owner == "com.apple.finder" && layer == icon_layer)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excludes_dock_only_when_requested() {
        assert!(exclude_desktop_window(
            "com.apple.dock",
            20,
            -20,
            true,
            false
        ));
        assert!(!exclude_desktop_window(
            "com.apple.dock",
            20,
            -20,
            false,
            true
        ));
        assert!(!exclude_desktop_window(
            "com.apple.Safari",
            20,
            -20,
            true,
            true
        ));
    }
    #[test]
    fn excludes_icons_without_removing_finder_windows_or_wallpaper() {
        assert!(exclude_desktop_window(
            "com.apple.finder",
            -20,
            -20,
            false,
            true
        ));
        assert!(!exclude_desktop_window(
            "com.apple.finder",
            0,
            -20,
            true,
            true
        ));
        assert!(!exclude_desktop_window(
            "com.apple.finder",
            -21,
            -20,
            true,
            true
        ));
    }
    #[test]
    fn preserves_desktop_when_disabled() {
        assert!(!exclude_desktop_window(
            "com.apple.finder",
            -20,
            -20,
            false,
            false
        ));
        assert!(!exclude_desktop_window(
            "com.apple.dock",
            20,
            -20,
            false,
            false
        ));
        assert!(!exclude_desktop_window(
            "com.apple.Wallpaper",
            -20,
            -20,
            true,
            true
        ));
    }
}
