//! Camera/cursor constraints augment the shared parameter contract.
use crate::{
    EditorError, Result,
    animation::{Binding, Value},
    effects::{Definition, Instance, Processor},
};

pub fn instance(instance: &Instance, definition: &Definition) -> Result<()> {
    if !matches!(
        definition.processor,
        Processor::CameraZoom | Processor::Cursor
    ) {
        return Ok(());
    }
    if matches!(definition.processor, Processor::CameraZoom) {
        if instance.range.is_none() {
            return invalid("camera zoom requires an explicit region");
        }
        let center = instance
            .parameters
            .get("center")
            .ok_or_else(|| EditorError::Invalid("zoom center is missing".into()))?;
        match center {
            Binding::Constant { value } => unit_point(value)?,
            Binding::Curve { keys, .. } => {
                for key in keys {
                    unit_point(&key.value)?;
                }
            }
        }
        // Legacy spring uses the original envelope, and cannot silently ignore custom timing.
        if matches!(instance.parameters.get("interpolation"), Some(Binding::Constant { value: Value::Choice(v) }) if v == "legacySpring")
        {
            if ["scale", "center", "followCursor"]
                .iter()
                .any(|key| matches!(instance.parameters.get(*key), Some(Binding::Curve { .. })))
            {
                return invalid(
                    "legacy spring preserves constant V1 decisions; choose easing to animate parameters",
                );
            }
            for (key, expected) in [("entryMs", 1522.575), ("exitMs", 1015.05)] {
                if !matches!(instance.parameters.get(key), Some(Binding::Constant { value: Value::Number(v) }) if *v == expected)
                {
                    return invalid(
                        "legacy camera timing requires the original entry/exit values; choose easing to edit timing",
                    );
                }
            }
        }
    }
    Ok(())
}
fn unit_point(value: &Value) -> Result<()> {
    if matches!(value, Value::Point(v) if v.iter().all(|n| (0. ..=1.).contains(n))) {
        Ok(())
    } else {
        invalid("zoom center must use normalized source coordinates")
    }
}
fn invalid<T>(message: &str) -> Result<T> {
    Err(EditorError::Invalid(message.into()))
}

/// Native processors require their exact parameter vocabulary even in external packs.
pub fn definition(definition: &Definition) -> Result<()> {
    let id = match definition.processor {
        Processor::CameraZoom => super::decisions::ZOOM_DEFINITION,
        Processor::Cursor => super::decisions::CURSOR_DEFINITION,
        _ => return Ok(()),
    };
    let expected = crate::effects::catalog::builtins()
        .into_iter()
        .find(|d| d.id == id)
        .expect("recording processor descriptor");
    if definition.parameters.len() != expected.parameters.len()
        || expected.parameters.iter().any(|expected| {
            definition
                .parameters
                .iter()
                .find(|p| p.key == expected.key)
                .is_none_or(|p| {
                    p.value_type != expected.value_type || p.animatable != expected.animatable
                })
        })
    {
        return invalid("recording processor parameter contract differs from its native backend");
    }
    Ok(())
}
