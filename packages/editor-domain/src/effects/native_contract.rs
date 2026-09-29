//! Built-in aliases expose the parameters and bounds their native nodes can apply.
use super::{Definition, ParameterType, Processor};
use crate::{EditorError, Result};

pub fn validate(definition: &Definition) -> Result<()> {
    let id = match definition.processor {
        Processor::ColorBalance => "beam.color",
        Processor::Transform => "beam.transform",
        Processor::Opacity => "beam.opacity",
        Processor::Gain => "beam.gain",
        Processor::Solid => "beam.solid",
        _ => return Ok(()),
    };
    let builtin = super::catalog::builtins()
        .into_iter()
        .find(|d| d.id == id)
        .ok_or_else(|| EditorError::Invalid("missing native processor descriptor".into()))?;
    if definition.parameters.len() != builtin.parameters.len()
        || builtin.parameters.iter().any(|expected| {
            definition
                .parameters
                .iter()
                .find(|p| p.key == expected.key)
                .is_none_or(|p| {
                    !supported_type(&p.value_type, &expected.value_type)
                        || p.animatable && !expected.animatable
                })
        })
    {
        return Err(EditorError::Invalid(format!(
            "{id} processor parameters exceed its native contract"
        )));
    }
    Ok(())
}

fn supported_type(actual: &ParameterType, supported: &ParameterType) -> bool {
    match (actual, supported) {
        (
            ParameterType::Number { min, max, .. },
            ParameterType::Number {
                min: lo, max: hi, ..
            },
        ) => min.is_finite() && max.is_finite() && lo <= min && min <= max && max <= hi,
        _ => actual == supported,
    }
}
