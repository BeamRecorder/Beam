//! Native identity, initial windows, tray, and shortcut policy.

use argui_platform::{
    AppIcon, ApplicationConfig, ApplicationId, ApplicationIdentity, CloseBehavior, GlobalShortcut,
    IconSet, TrayAction, TrayConfig, TrayItemId, TrayMenuItem, UiZoomConfig, WindowConfig,
    WindowKey, WindowLevel, WindowSpec,
};

/// Creates Beam's native launch or settings window from saved preferences.
///
/// # Errors
/// Returns an error for invalid identity, icon, or preference paths.
pub(crate) fn beam_config() -> Result<ApplicationConfig, Box<dyn std::error::Error>> {
    if crate::editor::is_editor() {
        return crate::editor::window_config();
    }
    let settings = std::env::args().any(|argument| argument == "--settings");
    let preferences = crate::beam::initial_preferences()?;
    let identity = ApplicationIdentity::new(
        ApplicationId::new("app.beam.native")?,
        "Beam",
        IconSet::single(beam_icon()?),
    );
    let tray = TrayConfig {
        tooltip: Some("Beam".into()),
        title: Some("Beam".into()),
        menu: complete_menu(Vec::new()),
        show_menu_on_left_click: false,
        ..TrayConfig::default()
    };
    let width = preferences.hud_window.width as f64;
    let height = preferences.hud_window.height as f64;
    let position = preferences
        .hud_position
        .map(|position| (position.x as i32, position.y as i32));
    let mut config = ApplicationConfig::new(
        identity,
        WindowConfig {
            title: if settings { "Beam Settings" } else { "Beam" }.into(),
            width: if settings { 640.0 } else { width },
            height: if settings { 420.0 } else { height },
            minimum_size: Some(if settings {
                (440.0, 320.0)
            } else {
                (
                    crate::beam::HUD_MIN_SIZE.0 as f64,
                    crate::beam::HUD_MIN_SIZE.1 as f64,
                )
            }),
            maximum_size: if settings {
                None
            } else {
                Some((
                    crate::beam::HUD_MAX_SIZE.0 as f64,
                    crate::beam::HUD_MAX_SIZE.1 as f64,
                ))
            },
            physical_position: if settings { None } else { position },
            close_behavior: if settings {
                CloseBehavior::Quit
            } else {
                CloseBehavior::Hide
            },
            decorations: false,
            transparent: true,
            native_shadow: true,
            ..WindowConfig::default()
        },
    );
    config = config.with_ui_zoom(UiZoomConfig::disabled());
    if !settings {
        for (key, title, width, height) in [
            (
                "regionControls",
                "Beam Region Controls",
                super::region::CONTROLS_SIZE.0,
                super::region::CONTROLS_SIZE.1,
            ),
            (
                "regionActions",
                "Beam Region Actions",
                super::region::ACTIONS_SIZE.0,
                super::region::ACTIONS_SIZE.1,
            ),
            ("countdown", "Beam Countdown", 560.0, 284.0),
            ("recorder", "Beam Recorder", 400.0, 54.0),
            ("settings", "Beam Settings", 640.0, 420.0),
            ("windowPicker", "Beam Window Picker", 960.0, 320.0),
            ("windowHighlight", "Beam Window Highlight", 320.0, 240.0),
            ("teleprompter", "Beam Teleprompter", 520.0, 360.0),
        ] {
            let mut window = WindowSpec::new(
                WindowKey::new(key),
                WindowConfig {
                    title: title.into(),
                    width,
                    height,
                    physical_position: preferences
                        .window_positions
                        .get(key)
                        .map(|position| (position.x as i32, position.y as i32)),
                    decorations: false,
                    resizable: matches!(key, "settings" | "teleprompter"),
                    minimum_size: match key {
                        "settings" => Some((440.0, 320.0)),
                        "teleprompter" => Some((320.0, 180.0)),
                        _ => None,
                    },
                    maximum_size: (key == "teleprompter").then_some((1600.0, 1000.0)),
                    transparent: true,
                    native_shadow: matches!(key, "settings" | "teleprompter"),
                    level: if key == "settings" {
                        WindowLevel::Normal
                    } else {
                        WindowLevel::AlwaysOnTop
                    },
                    close_behavior: CloseBehavior::Hide,
                    focus_on_launch: false,
                    skip_taskbar: matches!(
                        key,
                        "regionControls"
                            | "regionActions"
                            | "countdown"
                            | "recorder"
                            | "windowHighlight"
                    ),
                    ..WindowConfig::default()
                },
            );
            window.visible = false;
            config = config.with_window(window);
        }
        config = config.with_tray(tray);
        for (id, keys) in preferences.shortcuts {
            config = config.with_global_shortcut(GlobalShortcut::new(id, keys));
        }
    }
    Ok(config)
}

fn beam_icon() -> Result<AppIcon, argui_platform::AppIconError> {
    AppIcon::from_png(include_bytes!(
        "../../../../packages/beam-ui/assets/brand/tray.png"
    ))
}

/// Adds persistent show and quit actions to the tray menu.
pub(super) fn complete_menu(mut items: Vec<TrayMenuItem>) -> Vec<TrayMenuItem> {
    if !items.is_empty() {
        items.push(TrayMenuItem::Separator);
    }
    items.push(TrayMenuItem::Action {
        id: TrayItemId::new("beam-show"),
        label: "Show Beam".into(),
        enabled: true,
        action: TrayAction::FocusWindow(WindowKey::main()),
    });
    items.push(TrayMenuItem::Action {
        id: TrayItemId::new("beam-quit"),
        label: "Quit Beam".into(),
        enabled: true,
        action: TrayAction::Quit,
    });
    items
}
