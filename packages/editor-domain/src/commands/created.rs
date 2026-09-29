//! Receipts include only new identities, in stable document and parameter order.
use super::created_types::Baseline;
use crate::{Document, Result, animation::Binding, effects::Instance};
use std::{collections::HashSet, sync::Arc};
use uuid::Uuid;

pub(super) fn capture(document: &Document) -> Baseline {
    let mut collections = vec![(
        document.project.clips.clone(),
        document.project.tracks.clone(),
    )];
    collections.extend(
        document
            .sequences
            .iter()
            .map(|sequence| (sequence.state.clips.clone(), sequence.state.tracks.clone())),
    );
    let transitions = document
        .project
        .transitions
        .iter()
        .chain(
            document
                .sequences
                .iter()
                .flat_map(|sequence| &sequence.state.transitions),
        )
        .flat_map(|transition| identities(&transition.instance))
        .chain(
            document
                .project
                .sequence_instances
                .iter()
                .flat_map(identities),
        )
        .chain(document.sequences.iter().flat_map(|sequence| {
            sequence
                .state
                .sequence_instances
                .iter()
                .flat_map(identities)
        }))
        .collect();
    Baseline {
        collections,
        sequences: document
            .sequences
            .iter()
            .map(|sequence| sequence.id)
            .collect(),
        transitions,
    }
}

impl Baseline {
    fn contains(&self, id: Uuid) -> bool {
        self.sequences.contains(&id)
            || self.transitions.contains(&id)
            || self.collections.iter().any(|(clips, tracks)| {
                clips.identity_count(id) > 0 || tracks.identity_count(id) > 0
            })
    }
    fn unchanged(&self, clip: &Arc<crate::Clip>) -> Result<bool> {
        for (clips, _) in &self.collections {
            if let Some(previous) = clips.try_by_id(clip.id)? {
                return Ok(Arc::ptr_eq(&previous, clip));
            }
        }
        Ok(false)
    }
    fn unchanged_track(&self, track: &Arc<crate::Track>) -> Result<bool> {
        for (_, tracks) in &self.collections {
            if let Some(previous) = tracks.try_by_id(track.id)? {
                return Ok(Arc::ptr_eq(&previous, track));
            }
        }
        Ok(false)
    }
    pub(super) fn created(&self, document: &Document) -> Result<Vec<Uuid>> {
        let sequences: Vec<_> = document
            .sequences
            .iter()
            .filter(|sequence| !self.sequences.contains(&sequence.id))
            .collect();
        let clips: Vec<_> = std::iter::once(&document.project.clips)
            .chain(sequences.iter().map(|sequence| &sequence.state.clips))
            .collect();
        let tracks: Vec<_> = std::iter::once(&document.project.tracks)
            .chain(sequences.iter().map(|sequence| &sequence.state.tracks))
            .collect();
        let mut output = Vec::new();
        let mut emitted = HashSet::new();
        let mut push = |id| {
            if !self.contains(id) && emitted.insert(id) {
                output.push(id);
            }
        };
        for collection in &clips {
            for clip in collection.headers() {
                push(clip.id);
            }
        }
        for collection in &tracks {
            for track in collection.headers() {
                push(track.id);
            }
        }
        for sequence in &sequences {
            push(sequence.id);
        }
        for collection in clips {
            for clip in collection.try_dirty_items() {
                let clip = clip?;
                if self.unchanged(&clip)? {
                    continue;
                }
                for instance in clip.instances.iter().chain(clip.generator.iter()) {
                    for id in identities(instance) {
                        push(id);
                    }
                }
            }
        }
        for collection in tracks {
            for track in collection.try_dirty_items() {
                let track = track?;
                if self.unchanged_track(&track)? {
                    continue;
                }
                for instance in &track.instances {
                    for id in identities(instance) {
                        push(id);
                    }
                }
            }
        }
        for instance in document.project.sequence_instances.iter().chain(
            sequences
                .iter()
                .flat_map(|sequence| &sequence.state.sequence_instances),
        ) {
            for id in identities(instance) {
                push(id);
            }
        }
        for transition in document.project.transitions.iter().chain(
            sequences
                .iter()
                .flat_map(|sequence| &sequence.state.transitions),
        ) {
            for id in identities(&transition.instance) {
                push(id);
            }
        }
        Ok(output)
    }
}

fn identities(instance: &Instance) -> impl Iterator<Item = Uuid> + '_ {
    std::iter::once(instance.id).chain(instance.parameters.values().flat_map(|binding| {
        match binding {
            Binding::Constant { .. } => [].iter(),
            Binding::Curve { keys, .. } => keys.iter(),
        }
        .map(|key| key.id)
    }))
}
