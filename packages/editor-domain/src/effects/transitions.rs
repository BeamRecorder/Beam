//! Two-input transitions at adjacent cuts, borrowing real source handles.
use super::{Domain, Transition, definition};
use crate::{EditorError, Project, Result};

pub fn clock(
    clips: &crate::collections::PersistentCollection<crate::Clip>,
    transition: &Transition,
) -> Result<super::transition_types::TransitionClock> {
    let incoming = clips
        .try_header_by_id(transition.to_clip)?
        .ok_or_else(|| EditorError::Invalid("missing incoming transition clip".into()))?;
    if transition.duration_ms < 2 {
        return Err(EditorError::Invalid(
            "transition duration must be at least 2ms".into(),
        ));
    }
    let start_ms = incoming
        .start_ms
        .checked_sub(transition.duration_ms.div_ceil(2))
        .ok_or_else(|| EditorError::Invalid("transition extends before sequence".into()))?;
    let end = incoming
        .start_ms
        .checked_add(transition.duration_ms / 2)
        .ok_or_else(|| EditorError::Invalid("transition end overflow".into()))?;
    if end > crate::project::types::MAX_DURATION_MS {
        return Err(EditorError::Invalid(
            "transition exceeds exact timing budget".into(),
        ));
    }
    Ok(super::transition_types::TransitionClock { start_ms })
}

pub fn validate(project: &Project, transition: &Transition) -> Result<()> {
    transition.instance.validate(&project.definitions)?;
    if transition.instance.range.is_some() {
        return Err(EditorError::Invalid(
            "transition range is determined by its cut and duration".into(),
        ));
    }
    if transition.instance.parameters.values().any(|binding| {
        matches!(
            binding,
            crate::animation::Binding::Curve {
                space: crate::timing::TimeSpace::Source,
                ..
            }
        )
    }) {
        return Err(EditorError::Invalid("transition curves use transition-local or sequence time; two sources have no shared source clock".into()));
    }
    if definition(
        &project.definitions,
        &transition.instance.definition_id,
        transition.instance.definition_version,
    )?
    .domain
        != Domain::Transition
    {
        return Err(EditorError::Invalid(
            "transition requires a two-input definition".into(),
        ));
    }
    let from = project
        .clips
        .try_header_by_id(transition.from_clip)?
        .ok_or_else(|| EditorError::Invalid("missing outgoing transition clip".into()))?;
    let to = project
        .clips
        .try_header_by_id(transition.to_clip)?
        .ok_or_else(|| EditorError::Invalid("missing incoming transition clip".into()))?;
    let half = transition.duration_ms.div_ceil(2);
    let tail = transition.duration_ms / 2;
    if from.id == to.id
        || from.track_id != to.track_id
        || from.start_ms.checked_add(from.duration_ms) != Some(to.start_ms)
        || transition.duration_ms < 2
        || half > from.duration_ms
        || tail > to.duration_ms
    {
        return Err(EditorError::Invalid(
            "transition needs adjacent clips on one track and a range inside both clips".into(),
        ));
    }
    // Incoming pre-roll and outgoing post-roll cannot be fabricated or freeze-framed.
    let from_asset = project.assets.iter().find(|a| a.id == from.asset_id);
    let outgoing = from
        .duration_ms
        .checked_add(tail)
        .ok_or_else(|| EditorError::Invalid("transition handle time overflow".into()))?;
    let outgoing = from
        .source_in_ms
        .checked_add(from.rate.source_offset(outgoing)?)
        .ok_or_else(|| EditorError::Invalid("transition source handle overflow".into()))?;
    let handles = to.source_in_ms >= to.rate.source_offset(half)?
        && from_asset.is_none_or(|a| outgoing <= a.duration_ms);
    if !handles {
        return Err(EditorError::Invalid(
            "transition has insufficient source handles; trim the adjacent clips first".into(),
        ));
    }
    if project.transitions.iter().any(|other| {
        other.instance.id != transition.instance.id
            && (other.from_clip == from.id || other.to_clip == to.id)
    }) {
        return Err(EditorError::Invalid(
            "a cut can own only one transition".into(),
        ));
    }
    let begin = to.start_ms.saturating_sub(half);
    let end = to.start_ms.saturating_add(tail);
    for other in &project.transitions {
        if other.instance.id == transition.instance.id {
            continue;
        }
        if let Some(other_to) = project.clips.try_header_by_id(other.to_clip)?
            && other_to.track_id == to.track_id
        {
            let other_begin = other_to
                .start_ms
                .saturating_sub(other.duration_ms.div_ceil(2));
            let other_end = other_to.start_ms.saturating_add(other.duration_ms / 2);
            if begin < other_end && other_begin < end {
                return Err(EditorError::Invalid(
                    "transition intervals overlap and would require three inputs".into(),
                ));
            }
        }
    }
    Ok(())
}
