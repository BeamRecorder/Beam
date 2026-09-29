//! Typed parameter mutations use a single guard and the authoritative instance clock.
use super::{
    instances,
    operations::resolve,
    types::{CommandResult, Operation},
};
use crate::{
    Document, EditorError, Result,
    animation::{Binding, Keyframe},
    timing::{TimeRange, TimeSpace},
};
use uuid::Uuid;

pub(super) fn apply(
    document: &mut Document,
    operation: &Operation,
    results: &[CommandResult],
) -> Result<()> {
    match operation {
        Operation::ParameterSet {
            clip,
            instance,
            parameter,
            binding,
        } => {
            let clip = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            instances::with_instance(document, clip, instance, |target| {
                target.parameters.insert(parameter.clone(), binding.clone());
                Ok(())
            })
        }
        Operation::InstanceRename {
            clip,
            instance,
            name,
        } => {
            let clip = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            instances::with_instance(document, clip, instance, |target| {
                target.name = name.clone();
                Ok(())
            })
        }
        Operation::EffectRangeAt {
            clip,
            instance,
            start,
            end,
        } => {
            let clip = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            TimeRange {
                space: TimeSpace::Sequence,
                start: *start,
                end: *end,
            }
            .validate()?;
            let clock = instances::clock(document, clip, instance)?;
            instances::with_instance(document, clip, instance, |target| {
                let space = target
                    .range
                    .map_or(TimeSpace::ClipLocal, |range| range.space);
                let range = TimeRange {
                    space,
                    start: crate::timing::map_time(&clock, *start, space)?,
                    end: crate::timing::map_time(&clock, *end, space)?,
                };
                range.validate()?;
                target.range = Some(range);
                Ok(())
            })
        }
        Operation::CurveSpace {
            clip,
            instance,
            parameter,
            space,
        } => {
            let clip = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            let clock = instances::clock(document, clip, instance)?;
            instances::with_instance(document, clip, instance, |target| {
                let Some(Binding::Curve {
                    space: current,
                    keys,
                }) = target.parameters.get_mut(parameter)
                else {
                    return Err(invalid("parameter has no curve"));
                };
                let times = keys
                    .iter()
                    .map(|key| {
                        crate::timing::map_time(
                            &clock,
                            crate::timing::unmap_time(&clock, key.time, *current)?,
                            *space,
                        )
                    })
                    .collect::<Result<Vec<_>>>()?;
                for (key, time) in keys.iter_mut().zip(times) {
                    key.time = time;
                }
                *current = *space;
                Ok(())
            })
        }
        Operation::KeyframeAdd {
            clip,
            instance,
            parameter,
            space,
            time,
            value,
            interpolation,
        } => {
            time.validate()?;
            let clip = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            instances::with_instance(document, clip, instance, |target| {
                let binding = target
                    .parameters
                    .get_mut(parameter)
                    .ok_or_else(|| invalid("missing parameter"))?;
                let key = Keyframe {
                    id: Uuid::new_v4(),
                    time: *time,
                    value: value.clone(),
                    interpolation: interpolation.clone(),
                };
                match binding {
                    Binding::Constant { .. } => {
                        *binding = Binding::Curve {
                            space: *space,
                            keys: vec![key],
                        }
                    }
                    Binding::Curve {
                        space: current,
                        keys,
                    } => {
                        if current != space {
                            return Err(invalid("keyframe space differs from curve"));
                        }
                        keys.push(key);
                        keys.sort_by(|a, b| a.time.compare(b.time));
                    }
                }
                Ok(())
            })
        }
        Operation::KeyframeAt {
            clip,
            instance,
            parameter,
            space,
            sequence_time,
            value,
            interpolation,
        } => {
            let clip_id = resolve(clip, results)?;
            let instance_id = resolve(instance, results)?;
            let clock = instances::clock(document, clip_id, instance_id)?;
            let time = crate::timing::map_time(&clock, *sequence_time, *space)?;
            apply(
                document,
                &Operation::KeyframeAdd {
                    clip: clip.clone(),
                    instance: instance.clone(),
                    parameter: parameter.clone(),
                    space: *space,
                    time,
                    value: value.clone(),
                    interpolation: interpolation.clone(),
                },
                results,
            )
        }
        Operation::KeyframeUpdate {
            clip,
            instance,
            parameter,
            keyframe,
        } => {
            keyframe.time.validate()?;
            let clip = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            instances::with_instance(document, clip, instance, |target| {
                let Some(Binding::Curve { keys, .. }) = target.parameters.get_mut(parameter) else {
                    return Err(invalid("parameter has no curve"));
                };
                let key = keys
                    .iter_mut()
                    .find(|key| key.id == keyframe.id)
                    .ok_or_else(|| invalid("missing keyframe"))?;
                *key = keyframe.clone();
                keys.sort_by(|a, b| a.time.compare(b.time));
                Ok(())
            })
        }
        Operation::KeyframeRemove {
            clip,
            instance,
            parameter,
            keyframe_id,
        } => {
            let clip = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            instances::with_instance(document, clip, instance, |target| {
                let Some(binding @ Binding::Curve { .. }) = target.parameters.get_mut(parameter)
                else {
                    return Err(invalid("parameter has no curve"));
                };
                if let Binding::Curve { keys, .. } = binding {
                    let index = keys
                        .iter()
                        .position(|key| key.id == *keyframe_id)
                        .ok_or_else(|| invalid("missing keyframe"))?;
                    let removed = keys.remove(index);
                    if keys.is_empty() {
                        *binding = Binding::constant(removed.value);
                    }
                }
                Ok(())
            })
        }
        _ => Err(invalid("operation is not a parameter mutation")),
    }
}

fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
