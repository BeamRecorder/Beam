//! Typed layout keeps source-fit composition and native text placement distinct.
use super::{Definition, Instance, Processor, placement_types::FramePlacement};
use crate::{Canvas, Clip, EditorError, Result, timing::Time};

pub fn definition(definition: &Definition) -> Result<()> {
    let id = match definition.processor {
        Processor::Framing => "beam.framing",
        Processor::TextPlacement => "beam.textPlacement",
        _ => return Ok(()),
    };
    let builtin = super::catalog::builtins()
        .into_iter()
        .find(|d| d.id == id)
        .expect("layout built-in");
    if definition.parameters.len() != builtin.parameters.len()
        || builtin.parameters.iter().any(|expected| {
            definition
                .parameters
                .iter()
                .find(|p| p.key == expected.key)
                .is_none_or(|p| {
                    p.value_type != expected.value_type || p.animatable != expected.animatable
                })
        })
    {
        return Err(EditorError::Invalid(
            "layout processor parameters differ from its native contract".into(),
        ));
    }
    Ok(())
}

pub fn compatible(processor: &Processor, clip: &Clip) -> Result<()> {
    if matches!(processor, Processor::TextPlacement) && clip.title.is_none() {
        return Err(EditorError::Invalid(
            "text placement requires a native title".into(),
        ));
    }
    if matches!(processor, Processor::Framing) && clip.title.is_some() {
        return Err(EditorError::Invalid(
            "native titles use text placement, rather than source framing".into(),
        ));
    }
    Ok(())
}

pub fn number(instance: &Instance, clip: &Clip, key: &str, time: Time) -> Result<f64> {
    instance
        .parameters
        .get(key)
        .ok_or_else(|| EditorError::Invalid(format!("missing layout parameter {key}")))?
        .at_sequence(clip, time)?
        .number()
        .ok_or_else(|| EditorError::Invalid(format!("layout parameter {key} must be numeric")))
}

/// Exactly the V1 fit and rounding order, including placements outside the canvas.
pub fn frame(
    width: u32,
    height: u32,
    canvas: &Canvas,
    scale: f64,
    x: f64,
    y: f64,
) -> Result<FramePlacement> {
    if width == 0
        || height == 0
        || canvas.width == 0
        || canvas.height == 0
        || !scale.is_finite()
        || !(0.05..=5.).contains(&scale)
        || ![x, y]
            .iter()
            .all(|value| value.is_finite() && (0. ..=1.).contains(value))
    {
        return Err(EditorError::Invalid(
            "invalid source framing dimensions, scale or center".into(),
        ));
    }
    let aspect = width as f64 / height as f64;
    let width = (canvas.width as f64).min(canvas.height as f64 * aspect) * scale;
    let height = width / aspect;
    let round = |value: f64| -> Result<i32> {
        let value = value.round();
        if value < i32::MIN as f64 || value > i32::MAX as f64 {
            return Err(EditorError::Invalid(
                "native framing exceeds the geometry budget".into(),
            ));
        }
        Ok(value as i32)
    };
    Ok(FramePlacement {
        width: round(width)?,
        height: round(height)?,
        x: round(canvas.width as f64 * x - width * 0.5)?,
        y: round(canvas.height as f64 * y - height * 0.5)?,
    })
}
