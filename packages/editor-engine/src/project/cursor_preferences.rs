//! Saved cursor preferences migrate once; native documents then remain authoritative.
use super::cursor_preferences_types::{Click, Presentation};
use crate::{Result, video::pipeline::media};
use beam_editor_domain::recording::{
    cursor_style_types::{ClickEffect, CursorClickEffects, CursorShadow},
    style_types::CursorStyle,
};

/// Reads existing Beam user defaults; a missing preference document has no saved profile.
pub fn defaults(user: &std::path::Path) -> Result<Option<CursorStyle>> {
    let path = user.join("preferences.json");
    if !path.exists() {
        return Ok(None);
    }
    let value: serde_json::Value = super::recording::read(&path)?;
    value
        .pointer("/extras/editorDefaults/presentation/cursor")
        .map(import)
        .transpose()
}

/// A recorded presentation takes precedence over global defaults.
pub fn has_recorded_profile(root: &std::path::Path) -> Result<bool> {
    let path = root.join("project.json");
    if !path.exists() {
        return Ok(false);
    }
    let value: serde_json::Value = super::recording::read(&path)?;
    Ok(value.pointer("/editor/presentation/cursor").is_some())
}

pub fn import(value: &serde_json::Value) -> Result<CursorStyle> {
    let previous: Presentation = serde_json::from_value(value.clone())?;
    if !previous.auto_hide.delay_seconds.is_finite()
        || !(0.5..=10.).contains(&previous.auto_hide.delay_seconds)
    {
        return Err(media("saved cursor auto-hide delay is invalid"));
    }
    let cursor = CursorStyle {
        size: previous.size,
        color: color(&previous.color)?,
        selection: previous.selection,
        shadow: CursorShadow {
            enabled: previous.shadow.enabled,
            blur: previous.shadow.blur,
            color: color(&previous.shadow.color)?,
            direction: previous.shadow.direction,
        },
        click_effects: CursorClickEffects {
            left: click(previous.click_effects.left)?,
            right: click(previous.click_effects.right)?,
        },
        smoothing_ms: if previous.motion.smoothing == 0. {
            0
        } else {
            60
        },
        motion: previous.motion,
        hide_after_ms: if previous.auto_hide.enabled {
            (previous.auto_hide.delay_seconds * 1000.).round() as u64
        } else {
            0
        },
        fade_duration_ms: previous.auto_hide.fade_duration_ms,
        ..Default::default()
    };
    cursor.validate()?;
    Ok(cursor)
}
fn click(effect: Click) -> Result<ClickEffect> {
    Ok(ClickEffect {
        spring_enabled: effect.spring_enabled,
        spring_intensity: effect.spring_intensity,
        ripple_enabled: effect.ripple_enabled,
        ripple_style: effect.ripple_style,
        ripple_size: effect.ripple_size,
        ripple_color: color(&effect.ripple_color)?,
    })
}
pub fn color(value: &str) -> Result<[f64; 4]> {
    let value = value
        .strip_prefix('#')
        .ok_or_else(|| media("saved cursor color must be hexadecimal"))?;
    if !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(media("invalid saved cursor color"));
    }
    let expanded = match value.len() {
        3 | 4 => value.chars().flat_map(|c| [c, c]).collect::<String>(),
        6 | 8 => value.to_owned(),
        _ => return Err(media("invalid saved cursor color length")),
    };
    let mut channels = [1.; 4];
    for (index, channel) in expanded.as_bytes().chunks_exact(2).enumerate() {
        channels[index] = u8::from_str_radix(std::str::from_utf8(channel).map_err(media)?, 16)
            .map_err(media)? as f64
            / 255.;
    }
    Ok(channels)
}
