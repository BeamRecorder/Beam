use super::{ItemHeader, PersistentCollection, PersistentItem, Result};
use std::{
    collections::{BTreeSet, HashSet},
    sync::Arc,
};
impl<T: PersistentItem> PersistentCollection<T> {
    /// Unchanged pages and item pointers are skipped, including unloaded historical pages.
    pub fn try_changed_ids(&self, previous: &Self) -> Result<Vec<uuid::Uuid>> {
        if Arc::ptr_eq(&self.pages, &previous.pages) {
            return Ok(vec![]);
        }
        let old_pages: HashSet<_> = previous.pages.iter().map(Arc::as_ptr).collect();
        let new_pages: HashSet<_> = self.pages.iter().map(Arc::as_ptr).collect();
        let mut changed = BTreeSet::new();
        for (page, values) in self.pages.iter().enumerate() {
            if old_pages.contains(&Arc::as_ptr(values)) {
                continue;
            }
            for header in values.headers.iter() {
                let id = header.id();
                let Some(old) = previous.try_by_id(id)? else {
                    changed.insert(id);
                    continue;
                };
                let next = self
                    .values(page)?
                    .iter()
                    .find(|item| item.id() == id)
                    .ok_or_else(|| super::invalid("decision index differs from page"))?;
                if !Arc::ptr_eq(&old, next) && *old != **next {
                    changed.insert(id);
                }
            }
        }
        for page in previous.pages.iter() {
            if new_pages.contains(&Arc::as_ptr(page)) {
                continue;
            }
            for header in page.headers.iter() {
                if !self.index.locations.contains_key(&header.id()) {
                    changed.insert(header.id());
                }
            }
        }
        Ok(changed.into_iter().collect())
    }
}
