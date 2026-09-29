//! Stack ordering and parameter edits share the same typed instance semantics at every scope.
use super::{
    operations::resolve,
    scope_types::ScopedAction,
    types::{CommandResult, Reference},
};
use crate::{
    EditorError, Result,
    animation::{Binding, Keyframe},
    effects::{Definition, Instance},
    timing::TimeSpace,
};
use uuid::Uuid;

pub(super) fn apply(
    stack: &mut Vec<Instance>,
    action: &ScopedAction,
    catalog: &[Definition],
    results: &[CommandResult],
) -> Result<()> {
    match action {
        ScopedAction::Add {
            definition_id,
            definition_version,
            parameters,
        } => {
            let definition =
                crate::effects::definition(catalog, definition_id, *definition_version)?;
            let mut instance = definition.instantiate();
            instance.parameters.extend(parameters.clone());
            stack.push(instance);
        }
        ScopedAction::Update { instance } => {
            let index = position(stack, instance.id)?;
            stack[index] = instance.clone();
        }
        ScopedAction::Remove { instance } => {
            let index = position(stack, resolve(instance, results)?)?;
            stack.remove(index);
        }
        ScopedAction::Reorder { instance, index } => {
            if *index >= stack.len() {
                return Err(invalid("effect order is outside the target stack"));
            }
            let current = position(stack, resolve(instance, results)?)?;
            let instance = stack.remove(current);
            stack.insert(*index, instance);
        }
        ScopedAction::Duplicate { instance } => {
            let index = position(stack, resolve(instance, results)?)?;
            let copy = stack[index].duplicate();
            stack.insert(index + 1, copy);
        }
        ScopedAction::Bypass { instance, enabled } => {
            selected(stack, instance, results)?.enabled = *enabled;
        }
        ScopedAction::Rename { instance, name } => {
            selected(stack, instance, results)?.name = name.clone();
        }
        ScopedAction::Range { instance, range } => {
            selected(stack, instance, results)?.range = *range;
        }
        ScopedAction::ParameterSet {
            instance,
            parameter,
            binding,
        } => {
            let target = selected(stack, instance, results)?;
            if !target.parameters.contains_key(parameter) {
                return Err(invalid("missing effect parameter"));
            }
            target.parameters.insert(parameter.clone(), binding.clone());
        }
        ScopedAction::KeyframeAdd {
            instance,
            parameter,
            time,
            value,
            interpolation,
        } => {
            time.validate()?;
            let binding = parameter_mut(stack, instance, parameter, results)?;
            let key = Keyframe {
                id: Uuid::new_v4(),
                time: *time,
                value: value.clone(),
                interpolation: interpolation.clone(),
            };
            match binding {
                Binding::Constant { .. } => {
                    *binding = Binding::Curve {
                        space: TimeSpace::Sequence,
                        keys: vec![key],
                    };
                }
                Binding::Curve { space, keys } => {
                    if *space != TimeSpace::Sequence {
                        return Err(invalid("scoped keyframes require sequence time"));
                    }
                    keys.push(key);
                    keys.sort_by(|a, b| a.time.compare(b.time));
                }
            }
        }
        ScopedAction::KeyframeUpdate {
            instance,
            parameter,
            keyframe,
        } => {
            keyframe.time.validate()?;
            let Binding::Curve { keys, .. } = parameter_mut(stack, instance, parameter, results)?
            else {
                return Err(invalid("parameter has no curve"));
            };
            let key = keys
                .iter_mut()
                .find(|key| key.id == keyframe.id)
                .ok_or_else(|| invalid("missing keyframe"))?;
            *key = keyframe.clone();
            keys.sort_by(|a, b| a.time.compare(b.time));
        }
        ScopedAction::KeyframeRemove {
            instance,
            parameter,
            keyframe_id,
        } => {
            let binding = parameter_mut(stack, instance, parameter, results)?;
            let Binding::Curve { keys, .. } = binding else {
                return Err(invalid("parameter has no curve"));
            };
            let index = keys
                .iter()
                .position(|key| key.id == *keyframe_id)
                .ok_or_else(|| invalid("missing keyframe"))?;
            let removed = keys.remove(index);
            if keys.is_empty() {
                *binding = Binding::constant(removed.value);
            }
        }
    }
    Ok(())
}

fn position(stack: &[Instance], id: Uuid) -> Result<usize> {
    stack
        .iter()
        .position(|instance| instance.id == id)
        .ok_or_else(|| invalid("missing scoped effect instance"))
}
fn selected<'a>(
    stack: &'a mut [Instance],
    reference: &Reference,
    results: &[CommandResult],
) -> Result<&'a mut Instance> {
    let index = position(stack, resolve(reference, results)?)?;
    Ok(&mut stack[index])
}
fn parameter_mut<'a>(
    stack: &'a mut [Instance],
    reference: &Reference,
    parameter: &str,
    results: &[CommandResult],
) -> Result<&'a mut Binding> {
    selected(stack, reference, results)?
        .parameters
        .get_mut(parameter)
        .ok_or_else(|| invalid("missing effect parameter"))
}
fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
