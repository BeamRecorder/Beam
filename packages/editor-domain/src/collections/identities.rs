use super::{
    ItemHeader, PersistentCollection, PersistentItem, Result, invalid, types::IdentityIndex,
};
use std::sync::Arc;
use uuid::Uuid;
impl IdentityIndex {
    pub(crate) fn add(&mut self, ids: impl IntoIterator<Item = Uuid>) {
        for id in ids {
            if id.is_nil() {
                self.nil += 1;
            }
            let count = Arc::make_mut(&mut self.shards[id.as_bytes()[0] as usize])
                .entry(id)
                .or_default();
            if *count == 1 {
                self.duplicates += 1;
            }
            *count += 1;
        }
    }
    pub(crate) fn remove(&mut self, ids: impl IntoIterator<Item = Uuid>) {
        for id in ids {
            let shard = Arc::make_mut(&mut self.shards[id.as_bytes()[0] as usize]);
            if let Some(count) = shard.get_mut(&id) {
                if id.is_nil() {
                    self.nil = self.nil.saturating_sub(1);
                }
                if *count == 2 {
                    self.duplicates = self.duplicates.saturating_sub(1);
                }
                *count = count.saturating_sub(1);
                if *count == 0 {
                    shard.remove(&id);
                }
            }
        }
    }
}
impl<T: PersistentItem> PersistentCollection<T> {
    pub(crate) fn initialize_identities(&mut self) {
        let mut index = IdentityIndex::default();
        for header in self.headers() {
            index.add(header.identities());
        }
        self.identities = Arc::new(index);
    }
    pub fn identity_count(&self, id: Uuid) -> usize {
        self.identities.shards[id.as_bytes()[0] as usize]
            .get(&id)
            .copied()
            .unwrap_or(0)
    }
    pub fn validate_identities(&self) -> Result<()> {
        if self.identities.nil > 0 || self.identities.duplicates > 0 {
            return Err(invalid(
                "decision/effect/keyframe IDs must be non-nil and unique",
            ));
        }
        Ok(())
    }
    pub fn shares_identities(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.identities, &other.identities)
    }
    pub(crate) fn add_identities(&mut self, ids: impl IntoIterator<Item = Uuid>) {
        Arc::make_mut(&mut self.identities).add(ids);
        self.clear_header_validation();
    }
    pub(crate) fn remove_identities(&mut self, ids: impl IntoIterator<Item = Uuid>) {
        Arc::make_mut(&mut self.identities).remove(ids);
        self.clear_header_validation();
    }
}
