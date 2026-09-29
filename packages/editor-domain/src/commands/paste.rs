//! Copies decisions between sequences while preserving lane and link relationships.
use super::{
    operations::resolve,
    types::{CommandResult, Reference},
};
use crate::{Document, EditorError, Result};
use std::collections::{BTreeMap, HashMap, HashSet};
use uuid::Uuid;
pub fn mapped(
    next: &mut Document,
    original: &Document,
    ids: &[Uuid],
    source_id: Uuid,
    tracks: &BTreeMap<Uuid, Reference>,
    start: u64,
    results: &[CommandResult],
) -> Result<()> {
    if ids.is_empty() || ids.iter().collect::<HashSet<_>>().len() != ids.len() {
        return Err(EditorError::Invalid(
            "paste requires distinct selected clips".into(),
        ));
    }
    let source = original
        .sequences
        .iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| EditorError::Invalid("missing copy sequence".into()))?;
    let mut copies = ids
        .iter()
        .map(|id| {
            source
                .state
                .clips
                .try_by_id(*id)?
                .map(|clip| (*clip).clone())
                .ok_or_else(|| EditorError::Invalid("missing copy clip".into()))
        })
        .collect::<Result<Vec<_>>>()?;
    let begin = copies
        .iter()
        .map(|c| c.start_ms)
        .min()
        .expect("nonempty selection");
    let mut remap = HashMap::new();
    let mut links = HashMap::new();
    let selected: HashSet<_> = ids.iter().copied().collect();
    for clip in &mut copies {
        let reference = tracks.get(&clip.track_id).ok_or_else(|| {
            EditorError::Invalid("paste requires an explicit mapping for each source lane".into())
        })?;
        let lane = resolve(reference, results)?;
        let kind = source
            .state
            .tracks
            .try_header_by_id(clip.track_id)?
            .ok_or_else(|| EditorError::Invalid("missing source lane".into()))?
            .kind;
        if next
            .project
            .tracks
            .try_header_by_id(lane)?
            .is_none_or(|track| track.kind != kind)
        {
            return Err(EditorError::Invalid(
                "paste lane has an incompatible media kind".into(),
            ));
        }
        let id = Uuid::new_v4();
        remap.insert(clip.id, id);
        clip.id = id;
        clip.track_id = lane;
        clip.start_ms = start
            .checked_add(clip.start_ms - begin)
            .ok_or_else(|| EditorError::Invalid("paste time overflow".into()))?;
        clip.instances = clip
            .instances
            .iter()
            .map(crate::effects::Instance::duplicate)
            .collect();
        clip.generator = clip
            .generator
            .as_ref()
            .map(crate::effects::Instance::duplicate);
        clip.link_group = clip
            .link_group
            .filter(|g| {
                source
                    .state
                    .clips
                    .headers()
                    .filter(|c| c.link_group == Some(*g))
                    .all(|c| selected.contains(&c.id))
            })
            .map(|g| *links.entry(g).or_insert_with(Uuid::new_v4));
    }
    for transition in &source.state.transitions {
        if let (Some(from), Some(to)) = (
            remap.get(&transition.from_clip),
            remap.get(&transition.to_clip),
        ) {
            let mut copy = transition.clone();
            copy.instance = copy.instance.duplicate();
            copy.from_clip = *from;
            copy.to_clip = *to;
            next.project.transitions.push(copy);
        }
    }
    next.project.clips.try_extend(copies)?;
    Ok(())
}
