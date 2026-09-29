use super::{
    ItemHeader, PAGE_SIZE, PersistentCollection, PersistentItem, Result, invalid, loaded_page,
};
use std::{
    collections::HashSet,
    sync::{Arc, OnceLock},
};
use uuid::Uuid;

impl<T: PersistentItem> PersistentCollection<T> {
    fn available(&self, value: &T) -> Result<()> {
        if value.id().is_nil() || self.index.locations.contains_key(&value.id()) {
            return Err(invalid("decision ID must be non-nil and unique"));
        }
        Ok(())
    }
    pub fn try_push(&mut self, value: T) -> Result<()> {
        self.available(&value)?;
        let id = value.id();
        let identities = value.header().identities();
        let append = self
            .pages
            .last()
            .is_some_and(|page| page.headers.len() < PAGE_SIZE);
        if append {
            self.values(self.pages.len() - 1)?;
        }
        let pages = Arc::make_mut(&mut self.pages);
        let location = if append {
            let page_index = pages.len() - 1;
            let page = Arc::make_mut(&mut pages[page_index]);
            let item = page.headers.len();
            page.hash.take();
            page.dirty.push(std::sync::atomic::AtomicBool::new(true));
            page.header_hash.take();
            Arc::make_mut(&mut page.headers).push(Arc::new(value.header()));
            Arc::make_mut(
                page.values
                    .get_mut()
                    .ok_or_else(|| invalid("decision page failed to load"))?,
            )
            .push(Arc::new(value));
            super::types::Location {
                page: page_index,
                item,
            }
        } else {
            pages.push(loaded_page(vec![Arc::new(value)]));
            super::types::Location {
                page: pages.len() - 1,
                item: 0,
            }
        };
        Arc::make_mut(&mut self.index)
            .locations
            .insert(id, location);
        self.len += 1;
        self.add_identities(identities);
        Ok(())
    }
    pub fn try_insert(&mut self, index: usize, value: T) -> Result<()> {
        if index == self.len {
            return self.try_push(value);
        }
        self.available(&value)?;
        let identities = value.header().identities();
        if index > self.len {
            return Err(invalid("decision insertion offset exceeds collection"));
        }
        let mut base = 0;
        let mut location = (
            self.pages.len() - 1,
            self.pages.last().map_or(0, |p| p.headers.len()),
        );
        for (page, item) in self.pages.iter().enumerate() {
            if index < base + item.headers.len() {
                location = (page, index - base);
                break;
            }
            base += item.headers.len();
        }
        self.values(location.0)?;
        let pages = Arc::make_mut(&mut self.pages);
        let page = Arc::make_mut(&mut pages[location.0]);
        page.hash.take();
        page.dirty
            .insert(location.1, std::sync::atomic::AtomicBool::new(true));
        page.header_hash.take();
        Arc::make_mut(&mut page.headers).insert(location.1, Arc::new(value.header()));
        let values = page
            .values
            .get_mut()
            .ok_or_else(|| invalid("decision page failed to load"))?;
        Arc::make_mut(values).insert(location.1, Arc::new(value));
        if page.headers.len() > PAGE_SIZE {
            let midpoint = page.headers.len() / 2;
            let headers = Arc::new(Arc::make_mut(&mut page.headers).split_off(midpoint));
            let values = Arc::make_mut(
                page.values
                    .get_mut()
                    .ok_or_else(|| invalid("decision page failed to load"))?,
            )
            .split_off(midpoint);
            let right = super::types::DecisionPage {
                dirty: page.dirty.split_off(midpoint),
                headers,
                values: OnceLock::from(Arc::new(values)),
                load_lock: std::sync::Mutex::new(()),
                hash: OnceLock::new(),
                header_hash: OnceLock::new(),
            };
            pages.insert(location.0 + 1, Arc::new(right));
        }
        self.reindex();
        self.add_identities(identities);
        Ok(())
    }
    pub fn try_remove(&mut self, id: Uuid) -> Result<Option<Arc<T>>> {
        if self.index.duplicates.contains(&id) {
            return Err(invalid("decision ID appears more than once"));
        }
        let Some(location) = self.index.locations.get(&id).copied() else {
            return Ok(None);
        };
        self.values(location.page)?;
        let identities = self.pages[location.page].headers[location.item].identities();
        let pages = Arc::make_mut(&mut self.pages);
        let page = Arc::make_mut(&mut pages[location.page]);
        page.hash.take();
        page.dirty.remove(location.item);
        page.header_hash.take();
        Arc::make_mut(&mut page.headers).remove(location.item);
        let value = Arc::make_mut(
            page.values
                .get_mut()
                .ok_or_else(|| invalid("decision page failed to load"))?,
        )
        .remove(location.item);
        if page.headers.is_empty() {
            pages.remove(location.page);
        }
        self.reindex();
        self.remove_identities(identities);
        Ok(Some(value))
    }
    pub fn try_retain(&mut self, mut keep: impl FnMut(&T::Header) -> bool) -> Result<()> {
        let mut retained = Vec::with_capacity(self.pages.len());
        let mut removed = vec![];
        for (index, page) in self.pages.iter().enumerate() {
            let selection: Vec<_> = page
                .headers
                .iter()
                .enumerate()
                .filter_map(|(item, header)| keep(header).then_some(item))
                .collect();
            for (item, header) in page.headers.iter().enumerate() {
                if !selection.contains(&item) {
                    removed.extend(header.identities());
                }
            }
            if selection.len() == page.headers.len() {
                retained.push(Arc::clone(page));
            } else if !selection.is_empty() {
                let values = self.values(index)?;
                retained.push(Arc::new(super::types::DecisionPage {
                    dirty: selection
                        .iter()
                        .map(|&item| {
                            std::sync::atomic::AtomicBool::new(
                                page.dirty[item].load(std::sync::atomic::Ordering::Relaxed),
                            )
                        })
                        .collect(),
                    headers: Arc::new(
                        selection
                            .iter()
                            .map(|&item| Arc::clone(&page.headers[item]))
                            .collect(),
                    ),
                    values: OnceLock::from(Arc::new(
                        selection
                            .iter()
                            .map(|&item| Arc::clone(&values[item]))
                            .collect(),
                    )),
                    load_lock: std::sync::Mutex::new(()),
                    hash: OnceLock::new(),
                    header_hash: OnceLock::new(),
                }));
            }
        }
        self.pages = Arc::new(retained);
        self.reindex();
        self.remove_identities(removed);
        Ok(())
    }
    pub fn try_extend(&mut self, values: impl IntoIterator<Item = T>) -> Result<()> {
        let values: Vec<_> = values.into_iter().collect();
        let mut ids = HashSet::with_capacity(values.len());
        for value in &values {
            self.available(value)?;
            if !ids.insert(value.id()) {
                return Err(invalid("decision ID appears more than once"));
            }
        }
        if values.is_empty() {
            return Ok(());
        }
        let cells: Vec<_> = values.into_iter().map(Arc::new).collect();
        let identities = cells
            .iter()
            .flat_map(|value| value.header().identities())
            .collect::<Vec<_>>();
        Arc::make_mut(&mut self.pages).extend(
            cells
                .chunks(PAGE_SIZE)
                .map(|chunk| loaded_page(chunk.to_vec())),
        );
        self.reindex();
        self.add_identities(identities);
        Ok(())
    }
}
