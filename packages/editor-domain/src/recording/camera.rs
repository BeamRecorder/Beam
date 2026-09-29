//! Compiles editable camera regions in immutable source time for native playback.
use super::types::{Camera, CameraKey, Zoom};
use crate::{
    Clip, EditorError, MediaAsset, Result,
    animation::{Binding, Value},
    effects::Instance,
    timing::{Time, TimeSpace},
};
use uuid::Uuid;

/// Each legacy group renders once, preserving V1 connected pans and spring motion.
pub fn compile(asset: &MediaAsset, clip: &Clip, instance_id: Uuid) -> Result<Vec<CameraKey>> {
    let instance = clip
        .instances
        .iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| EditorError::Invalid("camera instance is missing".into()))?;
    if !instance.enabled {
        return Ok(rest(asset.duration_ms));
    }
    if legacy(instance) {
        let group: Vec<_> = clip
            .instances
            .iter()
            .filter(|i| i.enabled && i.definition_id == instance.definition_id && legacy(i))
            .collect();
        if group.first().is_none_or(|i| i.id != instance_id) {
            return Ok(rest(asset.duration_ms));
        }
        let mut source = asset.clone();
        source.zooms = group
            .iter()
            .map(|instance| {
                let (start_ms, end_ms) = source_region(clip, instance)?;
                let center = point(instance, clip, Time::ZERO)?;
                Ok(Zoom {
                    start_ms,
                    end_ms,
                    cx: center[0],
                    cy: center[1],
                    scale: number(instance, clip, "scale", Time::ZERO)?,
                })
            })
            .collect::<Result<Vec<_>>>()?
            .into();
        // The original playback evaluator requires ordered suggestions.
        std::sync::Arc::make_mut(&mut source.zooms).sort_by_key(|z| z.start_ms);
        let follows = group
            .iter()
            .map(|i| boolean(i, clip, "followCursor", Time::ZERO))
            .collect::<Result<Vec<_>>>()?;
        if follows.iter().all(|follows| !follows) {
            source.cursor = Default::default();
        }
        if follows.iter().any(|follows| *follows) && follows.iter().any(|follows| !follows) {
            return legacy_with_follow(&source, clip, &group);
        }
        return super::control::compile(&source);
    }
    let (start, end) = source_region(clip, instance)?;
    let begin = start.min(asset.duration_ms);
    let end = end.min(asset.duration_ms);
    let mut times = std::collections::BTreeSet::from([0, begin, end, asset.duration_ms]);
    let entry = number(instance, clip, "entryMs", Time::ZERO)? as u64;
    let exit = number(instance, clip, "exitMs", Time::ZERO)? as u64;
    times.insert(begin.saturating_add(entry).min(end));
    times.insert(end.saturating_sub(exit).max(begin));
    for time in (begin..end).step_by(33) {
        times.insert(time);
        if times.len() > 216_000 {
            return Err(EditorError::Invalid(
                "camera curve exceeds its control-point budget".into(),
            ));
        }
    }
    times
        .into_iter()
        .map(|time| {
            let sequence = crate::timing::sequence_time(clip, Time::milliseconds(time as i64))?;
            Ok(CameraKey {
                time_ms: time,
                camera: evaluate(instance, asset, clip, sequence)?,
            })
        })
        .collect()
}

pub fn evaluate(
    instance: &Instance,
    asset: &MediaAsset,
    clip: &Clip,
    sequence: Time,
) -> Result<Camera> {
    if !instance.active(clip, sequence)? {
        return Ok(Camera::default());
    }
    let range = instance
        .range
        .ok_or_else(|| EditorError::Invalid("camera instance requires a region".into()))?;
    let time = crate::timing::map_time(clip, sequence, range.space)?.seconds() * 1000.;
    let local = time - range.start.seconds() * 1000.;
    let duration = (range.end.seconds() - range.start.seconds()) * 1000.;
    let incoming = number(instance, clip, "entryMs", sequence)?;
    let outgoing = number(instance, clip, "exitMs", sequence)?;
    let total = incoming + outgoing;
    let fit = if total > duration {
        duration / total
    } else {
        1.
    };
    let incoming = incoming * fit;
    let outgoing = outgoing * fit;
    let strength = (if incoming == 0. { 1. } else { local / incoming })
        .min(if outgoing == 0. {
            1.
        } else {
            (duration - local) / outgoing
        })
        .clamp(0., 1.);
    let strength = if choice(instance, "interpolation") == "linear" {
        strength
    } else {
        1. - (1. - strength).powi(3)
    };
    let mut center = point(instance, clip, sequence)?;
    if boolean(instance, clip, "followCursor", sequence)? {
        let source = crate::timing::map_time(clip, sequence, TimeSpace::Source)?.seconds() * 1000.;
        if let Some(cursor) = super::playback::cursor_at(&asset.cursor, source) {
            center = [cursor.x, cursor.y];
        }
    }
    Ok(super::playback::clamp(Camera {
        x: center[0],
        y: center[1],
        scale: 1. + (number(instance, clip, "scale", sequence)? - 1.) * strength,
    }))
}

fn legacy_with_follow(
    asset: &MediaAsset,
    clip: &Clip,
    group: &[&Instance],
) -> Result<Vec<CameraKey>> {
    let baseline = super::control::compile(asset)?;
    let regions = group
        .iter()
        .map(|instance| {
            Ok((
                source_region(clip, instance)?,
                boolean(instance, clip, "followCursor", Time::ZERO)?,
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    let mut state = super::types::Follow::default();
    let mut velocity = super::types::Velocity::default();
    let mut camera = Camera::default();
    let mut last = 0;
    let mut keys = Vec::with_capacity(baseline.len());
    for key in baseline {
        let time = key.time_ms;
        let delta = time.saturating_sub(last);
        if delta > 100 {
            state = Default::default();
            velocity = Default::default();
            camera = Camera::default();
        }
        let (desired, strength, follows) = super::playback::at(&asset.zooms, time as f64);
        let weight = |(range, _): &((u64, u64), bool)| {
            super::playback::strength(
                &Zoom {
                    start_ms: range.0,
                    end_ms: range.1,
                    cx: 0.5,
                    cy: 0.5,
                    scale: 2.,
                },
                time as f64,
            )
        };
        let best = regions
            .iter()
            .max_by(|a, b| weight(a).total_cmp(&weight(b)));
        let follows = follows && best.is_some_and(|(_, follows)| *follows);
        let target = if follows {
            super::follow::target(
                &mut state,
                super::playback::cursor_at(&asset.cursor, time as f64),
                desired,
                strength,
                time as f64,
            )
        } else {
            desired
        };
        camera = super::spring::step(camera, target, &mut velocity, delta as f64, 11.95);
        if time == asset.duration_ms && strength < 0.01 {
            camera = Camera::default();
        }
        keys.push(CameraKey {
            time_ms: time,
            camera: super::playback::clamp(camera),
        });
        last = time;
    }
    Ok(keys)
}

fn source_region(clip: &Clip, instance: &Instance) -> Result<(u64, u64)> {
    let range = instance
        .range
        .ok_or_else(|| EditorError::Invalid("zoom requires a region".into()))?;
    let source = |time: Time| -> Result<u64> {
        let sequence = crate::timing::unmap_time(clip, time, range.space)?;
        let source = crate::timing::map_time(clip, sequence, TimeSpace::Source)?
            .rescale(1000)?
            .ticks;
        u64::try_from(source)
            .map_err(|_| EditorError::Invalid("zoom region extends before its source".into()))
    };
    Ok((source(range.start)?, source(range.end)?))
}
pub fn legacy(instance: &Instance) -> bool {
    choice(instance, "interpolation") == "legacySpring"
}
fn choice<'a>(instance: &'a Instance, key: &str) -> &'a str {
    match instance.parameters.get(key) {
        Some(Binding::Constant {
            value: Value::Choice(value),
        }) => value,
        _ => "ease",
    }
}
fn parameter(instance: &Instance, clip: &Clip, key: &str, sequence: Time) -> Result<Value> {
    instance
        .parameters
        .get(key)
        .ok_or_else(|| EditorError::Invalid(format!("missing camera parameter {key}")))?
        .at_sequence(clip, sequence)
}
fn number(instance: &Instance, clip: &Clip, key: &str, sequence: Time) -> Result<f64> {
    parameter(instance, clip, key, sequence)?
        .number()
        .ok_or_else(|| EditorError::Invalid(format!("camera parameter {key} must be numeric")))
}
fn boolean(instance: &Instance, clip: &Clip, key: &str, sequence: Time) -> Result<bool> {
    match parameter(instance, clip, key, sequence)? {
        Value::Boolean(value) => Ok(value),
        _ => Err(EditorError::Invalid(format!(
            "camera parameter {key} must be boolean"
        ))),
    }
}
fn point(instance: &Instance, clip: &Clip, sequence: Time) -> Result<[f64; 2]> {
    match parameter(instance, clip, "center", sequence)? {
        Value::Point(value) => Ok(value),
        _ => Err(EditorError::Invalid("camera center must be a point".into())),
    }
}
fn rest(end: u64) -> Vec<CameraKey> {
    vec![
        CameraKey {
            time_ms: 0,
            camera: Camera::default(),
        },
        CameraKey {
            time_ms: end,
            camera: Camera::default(),
        },
    ]
}
