//! Bounds artwork identifiers and all cursor presentation parameters at the domain boundary.
use super::{cursor_style_types::SelectionMode, style_types::CursorStyle};
use crate::{EditorError, Result};

pub fn validate(style: &CursorStyle) -> Result<()> {
    let bounded =
        |value: f64, low: f64, high: f64| value.is_finite() && (low..=high).contains(&value);
    let selection = &style.selection;
    if selection.pack_id.is_empty()
        || selection.pack_id.len() > 128
        || selection
            .pack_id
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && !":-_".contains(c))
        || selection.cursor_id.as_ref().is_some_and(|id| {
            id.is_empty()
                || id.len() > 128
                || id
                    .chars()
                    .any(|c| !c.is_ascii_alphanumeric() && !"-_".contains(c))
        })
        || (selection.mode == SelectionMode::Fixed && selection.cursor_id.is_none())
        || !bounded(style.shadow.blur, 0., 30.)
        || style.shadow.color.iter().any(|v| !bounded(*v, 0., 1.))
        || !bounded(style.motion.smoothing, 0., 1.)
        || !bounded(style.motion.spring_mass_multiplier, 0.5, 2.)
        || !bounded(style.motion.motion_blur, 0., 1.)
        || style.fade_duration_ms > 1000
    {
        return Err(EditorError::Invalid(
            "invalid cursor selection, shadow, motion or fade settings".into(),
        ));
    }
    for effect in [&style.click_effects.left, &style.click_effects.right] {
        if !bounded(effect.spring_intensity, 0., 100.)
            || !bounded(effect.ripple_size, 10., 80.)
            || effect.ripple_color.iter().any(|v| !bounded(*v, 0., 1.))
        {
            return Err(EditorError::Invalid("invalid cursor click settings".into()));
        }
    }
    Ok(())
}
