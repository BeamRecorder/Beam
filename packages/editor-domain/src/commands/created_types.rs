//! Copy-on-write baselines retain identity indexes without materializing decisions.
use crate::{Clip, Track, collections::PersistentCollection};
use std::collections::HashSet;
use uuid::Uuid;

pub(super) struct Baseline {
    pub collections: Vec<(PersistentCollection<Clip>, PersistentCollection<Track>)>,
    pub sequences: HashSet<Uuid>,
    pub transitions: HashSet<Uuid>,
}
