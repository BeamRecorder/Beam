use super::{ItemHeader, ItemMut, PersistentCollection, PersistentItem, Result, invalid};
use std::{
    ops::{Deref, DerefMut},
    sync::Arc,
};
use uuid::Uuid;

impl<T: PersistentItem> PersistentCollection<T> {
    pub fn try_header_by_id(&self, id: Uuid) -> Result<Option<&T::Header>> {
        if self.index.duplicates.contains(&id) {
            return Err(invalid("decision ID appears more than once"));
        }
        let Some(location) = self.index.locations.get(&id) else {
            return Ok(None);
        };
        self.pages
            .get(location.page)
            .and_then(|page| page.headers.get(location.item))
            .map(|header| Some(header.as_ref()))
            .ok_or_else(|| invalid("decision index differs from page"))
    }
    pub(crate) fn values(&self, index: usize) -> Result<&super::PageValues<T>> {
        let page = self
            .pages
            .get(index)
            .ok_or_else(|| invalid("missing decision page"))?;
        if page.values.get().is_none() {
            let _gate = page
                .load_lock
                .lock()
                .map_err(|_| invalid("decision page loader stopped"))?;
            if page.values.get().is_none() {
                let hash = page
                    .hash
                    .get()
                    .ok_or_else(|| invalid("unloaded decision page has no hash"))?;
                let loader = self
                    .loader
                    .as_ref()
                    .ok_or_else(|| invalid("decision page has no loader"))?;
                let values = loader(hash)
                    .map_err(|error| invalid(format!("decision page {hash}: {error}")))?;
                if values.len() != page.headers.len()
                    || values
                        .iter()
                        .zip(page.headers.iter())
                        .any(|(value, header)| {
                            value.id() != header.id() || value.header() != **header
                        })
                {
                    return Err(invalid(format!(
                        "decision page {hash} differs from its persisted headers"
                    )));
                }
                let _ = page.values.set(values);
            }
        }
        page.values
            .get()
            .ok_or_else(|| invalid("decision page failed to load"))
    }
    pub fn try_by_id(&self, id: Uuid) -> Result<Option<Arc<T>>> {
        if self.index.duplicates.contains(&id) {
            return Err(invalid("decision ID appears more than once"));
        }
        let Some(location) = self.index.locations.get(&id) else {
            return Ok(None);
        };
        Ok(Some(Arc::clone(
            self.values(location.page)?
                .get(location.item)
                .ok_or_else(|| invalid("decision index differs from page"))?,
        )))
    }
    pub fn try_by_id_mut(&mut self, id: Uuid) -> Result<Option<ItemMut<'_, T>>> {
        if self.index.duplicates.contains(&id) {
            return Err(invalid("decision ID appears more than once"));
        }
        let Some(location) = self.index.locations.get(&id).copied() else {
            return Ok(None);
        };
        self.values(location.page)?;
        let page = Arc::make_mut(&mut Arc::make_mut(&mut self.pages)[location.page]);
        page.dirty[location.item].store(true, std::sync::atomic::Ordering::Relaxed);
        page.hash.take();
        let values = page
            .values
            .get_mut()
            .ok_or_else(|| invalid("decision page failed to load"))?;
        let item = Arc::make_mut(values)
            .get_mut(location.item)
            .ok_or_else(|| invalid("decision index differs from page"))?;
        Ok(Some(ItemMut {
            value: Arc::make_mut(item),
            header: &mut Arc::make_mut(&mut page.headers)[location.item],
            index: &mut self.index,
            location,
            previous_id: id,
            header_hash: &mut page.header_hash,
            identities: &mut self.identities,
            header_validation: &mut self.header_validation,
        }))
    }
    pub fn try_page(&self, offset: usize, limit: usize) -> Result<Vec<Arc<T>>> {
        if limit == 0 || offset > self.len {
            return Err(invalid(
                "decision page requires a positive limit and valid offset",
            ));
        }
        let end = offset.saturating_add(limit).min(self.len);
        let mut base = 0;
        let mut output = Vec::with_capacity(end - offset);
        for (index, page) in self.pages.iter().enumerate() {
            let next = base + page.headers.len();
            if offset < next && end > base {
                let start = offset.saturating_sub(base);
                let stop = (end - base).min(page.headers.len());
                output.extend(self.values(index)?[start..stop].iter().cloned());
            }
            base = next;
            if base >= end {
                break;
            }
        }
        Ok(output)
    }
    pub fn try_iter(&self) -> impl Iterator<Item = Result<Arc<T>>> + '_ {
        self.pages
            .iter()
            .enumerate()
            .flat_map(move |(page, metadata)| {
                (0..metadata.headers.len()).map(move |item| {
                    self.values(page).and_then(|values| {
                        values
                            .get(item)
                            .cloned()
                            .ok_or_else(|| invalid("decision index differs from page"))
                    })
                })
            })
    }
    pub fn try_page_values(&self, index: usize) -> Result<super::PageValues<T>> {
        self.values(index).cloned()
    }
    pub fn try_dirty_items(&self) -> impl Iterator<Item = Result<Arc<T>>> + '_ {
        self.pages
            .iter()
            .enumerate()
            .flat_map(move |(page, values)| {
                values
                    .dirty
                    .iter()
                    .enumerate()
                    .filter(|(_, dirty)| dirty.load(std::sync::atomic::Ordering::Relaxed))
                    .map(move |(item, _)| {
                        self.values(page).and_then(|values| {
                            values
                                .get(item)
                                .cloned()
                                .ok_or_else(|| invalid("decision index differs from page"))
                        })
                    })
            })
    }
}
impl<T: PersistentItem> Deref for ItemMut<'_, T> {
    type Target = T;
    fn deref(&self) -> &T {
        self.value
    }
}
impl<T: PersistentItem> DerefMut for ItemMut<'_, T> {
    fn deref_mut(&mut self) -> &mut T {
        self.value
    }
}
impl<T: PersistentItem> Drop for ItemMut<'_, T> {
    fn drop(&mut self) {
        let header = self.value.header();
        let id = header.id();
        if header != **self.header {
            let mut previous = self.header.identities();
            let mut next = header.identities();
            previous.sort_unstable();
            next.sort_unstable();
            if previous != next {
                let identities = Arc::make_mut(self.identities);
                identities.remove(previous);
                identities.add(next);
            }
            *self.header_validation =
                Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
            *self.header = Arc::new(header);
            self.header_hash.take();
        }
        if id != self.previous_id {
            let index = Arc::make_mut(self.index);
            index.locations.remove(&self.previous_id);
            if index.locations.insert(id, self.location).is_some() {
                index.duplicates.insert(id);
            }
        }
    }
}
