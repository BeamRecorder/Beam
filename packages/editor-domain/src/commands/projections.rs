//! One coordinate mapping for timeline regions and inspector values across all clients.
use crate::{
    Document, EditorError, Result,
    animation::Value,
    collections::{ClipHeader, InstanceHeader},
    effects::{Definition, Instance, ScopeTarget},
    protocol::{ReadTarget, RegionKind, TimelineRegion},
    timing::{SequenceClock, Time, TimeRange, TimeSpace, unmap_time},
};
use std::collections::BTreeMap;
use uuid::Uuid;

/// Header validation checks catalogue/time metadata without inspecting parameters or keys.
pub fn validate_clip_header(catalog: &[Definition], clip: &ClipHeader) -> Result<()> {
    if clip.id.is_nil() || clip.duration_ms == 0 {
        return Err(EditorError::Invalid(
            "invalid clip header identity or duration".into(),
        ));
    }
    clip.rate.validate()?;
    milliseconds(clip.start_ms)?;
    milliseconds(
        clip.start_ms
            .checked_add(clip.duration_ms)
            .ok_or_else(|| EditorError::Invalid("clip end overflow".into()))?,
    )?;
    for instance in clip.instances.iter().chain(clip.generator.iter()) {
        crate::effects::scopes::validate_header(catalog, instance, ScopeTarget::Clip, None)?;
    }
    Ok(())
}

pub fn regions(
    document: &Document,
    sequence_id: Uuid,
    start: Time,
    end: Time,
) -> Result<Vec<TimelineRegion>> {
    let viewport = TimeRange {
        space: TimeSpace::Sequence,
        start,
        end,
    };
    viewport.validate()?;
    let sequence = sequence(document, sequence_id)?;
    let mut result = Vec::new();
    let mut duration = Time::ZERO;
    for clip in sequence.state.clips.headers() {
        validate_clip_header(&document.project.definitions, clip)?;
        let clip_start = milliseconds(clip.start_ms)?;
        let clip_end = milliseconds(
            clip.start_ms
                .checked_add(clip.duration_ms)
                .ok_or_else(|| EditorError::Invalid("clip end overflow".into()))?,
        )?;
        duration = later(duration, clip_end);
        if !intersects(clip_start, clip_end, viewport) {
            continue;
        }
        for instance in clip.instances.iter().chain(clip.generator.iter()) {
            let definition = crate::effects::definition(
                &document.project.definitions,
                &instance.definition_id,
                instance.definition_version,
            )?;
            if !definition.timeline_region && instance.range.is_none() {
                continue;
            }
            let (mut from, mut to) = (clip_start, clip_end);
            if let Some(range) = instance.range {
                from = later(from, unmap_time(clip, range.start, range.space)?);
                to = earlier(to, unmap_time(clip, range.end, range.space)?);
            }
            if intersects(from, to, viewport) {
                result.push(region(
                    instance,
                    ReadTarget::Clip {
                        sequence_id,
                        clip_id: clip.id,
                    },
                    RegionKind::Effect,
                    from,
                    to,
                ));
            }
        }
    }
    for transition in &sequence.state.transitions {
        transition
            .instance
            .validate(&document.project.definitions)?;
        let clock = crate::effects::transitions::clock(&sequence.state.clips, transition)?;
        let from = milliseconds(clock.start_ms)?;
        let to = milliseconds(
            clock
                .start_ms
                .checked_add(transition.duration_ms)
                .ok_or_else(|| EditorError::Invalid("transition end overflow".into()))?,
        )?;
        if intersects(from, to, viewport) {
            result.push(region(
                &InstanceHeader::from(&transition.instance),
                ReadTarget::Clip {
                    sequence_id,
                    clip_id: transition.from_clip,
                },
                RegionKind::Transition,
                from,
                to,
            ));
        }
    }
    let bounds = TimeRange {
        space: TimeSpace::Sequence,
        start: Time::ZERO,
        end: duration,
    };
    for track in sequence.state.tracks.headers() {
        crate::effects::scopes::validate_track_header(&document.project, track)?;
        for instance in &track.instances {
            scoped_region(
                &mut result,
                instance,
                ReadTarget::Track {
                    sequence_id,
                    track_id: track.id,
                },
                bounds,
                viewport,
                &document.project.definitions,
            )?;
        }
    }
    crate::effects::scopes::validate_sequence(
        &document.project,
        &sequence.state.sequence_instances,
    )?;
    for instance in &sequence.state.sequence_instances {
        scoped_region(
            &mut result,
            &InstanceHeader::from(instance),
            ReadTarget::Sequence { sequence_id },
            bounds,
            viewport,
            &document.project.definitions,
        )?;
    }
    result.sort_by(|a, b| a.start.compare(b.start).then(a.id.cmp(&b.id)));
    Ok(result)
}

fn scoped_region(
    result: &mut Vec<TimelineRegion>,
    instance: &InstanceHeader,
    target: ReadTarget,
    bounds: TimeRange,
    viewport: TimeRange,
    catalog: &[Definition],
) -> Result<()> {
    let definition = crate::effects::definition(
        catalog,
        &instance.definition_id,
        instance.definition_version,
    )?;
    if !definition.timeline_region && instance.range.is_none() {
        return Ok(());
    }
    let (mut from, mut to) = (bounds.start, bounds.end);
    if let Some(range) = instance.range {
        from = later(from, unmap_time(&SequenceClock, range.start, range.space)?);
        to = earlier(to, unmap_time(&SequenceClock, range.end, range.space)?);
    }
    if intersects(from, to, viewport) {
        result.push(region(instance, target, RegionKind::Effect, from, to));
    }
    Ok(())
}

/// New scopes share the evaluator used by clip inspection and the native renderer.
pub fn scoped_parameter_values(
    document: &Document,
    target: ReadTarget,
    time: Time,
) -> Result<BTreeMap<Uuid, BTreeMap<String, Value>>> {
    time.validate()?;
    match target {
        ReadTarget::Clip {
            sequence_id,
            clip_id,
        } => parameter_values(document, sequence_id, clip_id, time),
        ReadTarget::Track {
            sequence_id,
            track_id,
        } => {
            let track = super::query::track(document, sequence_id, track_id)?;
            evaluate_sequence_stack(&track.instances, time)
        }
        ReadTarget::Sequence { sequence_id } => {
            let sequence = sequence(document, sequence_id)?;
            crate::effects::scopes::validate_sequence(
                &document.project,
                &sequence.state.sequence_instances,
            )?;
            evaluate_sequence_stack(&sequence.state.sequence_instances, time)
        }
    }
}
fn evaluate_sequence_stack(
    instances: &[Instance],
    time: Time,
) -> Result<BTreeMap<Uuid, BTreeMap<String, Value>>> {
    instances
        .iter()
        .map(|instance| Ok((instance.id, instance.evaluated(&SequenceClock, time)?)))
        .collect()
}

pub fn parameter_values(
    document: &Document,
    sequence_id: Uuid,
    clip_id: Uuid,
    time: Time,
) -> Result<BTreeMap<Uuid, BTreeMap<String, Value>>> {
    time.validate()?;
    let sequence = sequence(document, sequence_id)?;
    let clip = sequence
        .state
        .clips
        .try_by_id(clip_id)?
        .ok_or_else(|| EditorError::Invalid("missing clip".into()))?;
    clip.rate.validate()?;
    let mut values = BTreeMap::new();
    for instance in clip.instances.iter().chain(clip.generator.iter()) {
        instance.validate(&document.project.definitions)?;
        values.insert(instance.id, instance.evaluated(&clip, time)?);
    }
    for transition in sequence
        .state
        .transitions
        .iter()
        .filter(|t| t.from_clip == clip_id)
    {
        transition
            .instance
            .validate(&document.project.definitions)?;
        let clock = crate::effects::transitions::clock(&sequence.state.clips, transition)?;
        values.insert(
            transition.instance.id,
            transition.instance.evaluated(&clock, time)?,
        );
    }
    Ok(values)
}
fn sequence(document: &Document, id: Uuid) -> Result<&crate::timeline::sequence_types::Sequence> {
    document
        .sequences
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| EditorError::Invalid("missing sequence".into()))
}
fn region(
    instance: &InstanceHeader,
    target: ReadTarget,
    kind: RegionKind,
    start: Time,
    end: Time,
) -> TimelineRegion {
    TimelineRegion {
        id: instance.id,
        target,
        definition_id: instance.definition_id.clone(),
        definition_version: instance.definition_version,
        name: instance.name.clone(),
        kind,
        start,
        end,
        enabled: instance.enabled,
    }
}
fn milliseconds(value: u64) -> Result<Time> {
    let time = Time::milliseconds(
        i64::try_from(value)
            .map_err(|_| EditorError::Invalid("projection time overflow".into()))?,
    );
    time.validate()?;
    Ok(time)
}
fn intersects(from: Time, to: Time, viewport: TimeRange) -> bool {
    from.compare(to).is_lt()
        && from.compare(viewport.end).is_lt()
        && to.compare(viewport.start).is_gt()
}
fn earlier(a: Time, b: Time) -> Time {
    if a.compare(b).is_le() { a } else { b }
}
fn later(a: Time, b: Time) -> Time {
    if a.compare(b).is_ge() { a } else { b }
}
