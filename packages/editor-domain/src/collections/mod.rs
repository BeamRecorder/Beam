//! Persistent pages for typed decisions; lazy failures never become empty data or panics.
mod access;
mod cached;
mod changes;
pub mod headers;
mod identities;
mod memo;
mod mutations;
mod serialization;
pub mod track_types;
pub mod types;
use crate::{EditorError, Result};
pub use headers::{ClipHeader, InstanceHeader};
use std::sync::{Arc, Mutex, OnceLock};
pub use track_types::TrackHeader;
use types::{DecisionPage, IdIndex, Location};
pub use types::{
    ItemHeader, ItemMut, LazyPage, PAGE_SIZE, PageCache, PageLoader, PageReference, PageValues,
    PersistentCollection, PersistentItem,
};

pub(crate) fn invalid(message: impl Into<String>) -> EditorError {
    EditorError::Invalid(message.into())
}
pub(crate) fn loaded_page<T: PersistentItem>(values: Vec<Arc<T>>) -> Arc<DecisionPage<T>> {
    let headers = values
        .iter()
        .map(|value| Arc::new(value.header()))
        .collect();
    Arc::new(DecisionPage {
        dirty: (0..values.len())
            .map(|_| std::sync::atomic::AtomicBool::new(true))
            .collect(),
        headers: Arc::new(headers),
        values: OnceLock::from(Arc::new(values)),
        load_lock: Mutex::new(()),
        hash: OnceLock::new(),
        header_hash: OnceLock::new(),
    })
}
impl<T: PersistentItem> PersistentCollection<T> {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn len(&self) -> usize {
        self.len
    }
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }
    pub fn loaded_pages(&self) -> usize {
        self.pages
            .iter()
            .filter(|page| page.values.get().is_some())
            .count()
    }
    pub fn headers(&self) -> impl Iterator<Item = &T::Header> {
        self.pages
            .iter()
            .flat_map(|page| page.headers.iter().map(Arc::as_ref))
    }
    pub fn page_headers(&self, index: usize) -> Result<Vec<Arc<T::Header>>> {
        self.pages
            .get(index)
            .map(|page| page.headers.as_ref().clone())
            .ok_or_else(|| invalid("missing decision page"))
    }
    pub fn page_hash(&self, index: usize) -> Result<Option<&str>> {
        self.pages
            .get(index)
            .map(|page| page.hash.get().map(String::as_str))
            .ok_or_else(|| invalid("missing decision page"))
    }
    pub fn cache_page_hash(&self, index: usize, hash: String) -> Result<()> {
        validate_hash(&hash)?;
        let page = self
            .pages
            .get(index)
            .ok_or_else(|| invalid("missing decision page"))?;
        if page.hash.get().is_some_and(|existing| existing != &hash) {
            return Err(invalid("decision page hash differs from immutable content"));
        }
        let _ = page.hash.set(hash);
        for dirty in &page.dirty {
            dirty.store(false, std::sync::atomic::Ordering::Relaxed);
        }
        Ok(())
    }
    pub fn shared_pages(&self, other: &Self) -> usize {
        self.pages
            .iter()
            .zip(other.pages.iter())
            .filter(|(left, right)| Arc::ptr_eq(left, right))
            .count()
    }
    pub fn shares_index(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.index, &other.index)
    }
    pub fn validate_index(&self) -> Result<()> {
        if self.index.locations.contains_key(&uuid::Uuid::nil())
            || !self.index.duplicates.is_empty()
            || self.index.locations.len() != self.len
        {
            return Err(invalid("decision IDs must be non-nil and unique"));
        }
        Ok(())
    }
    pub fn from_lazy(pages: Vec<LazyPage<T::Header>>, loader: PageLoader<T>) -> Result<Self> {
        let mut values = Vec::with_capacity(pages.len());
        for page in pages {
            validate_hash(&page.hash)?;
            if page.headers.is_empty() || page.headers.len() > PAGE_SIZE {
                return Err(invalid("decision page requires 1–128 headers"));
            }
            values.push(Arc::new(DecisionPage {
                dirty: (0..page.headers.len())
                    .map(|_| std::sync::atomic::AtomicBool::new(false))
                    .collect(),
                headers: Arc::new(page.headers.into_iter().map(Arc::new).collect()),
                values: OnceLock::new(),
                load_lock: Mutex::new(()),
                hash: OnceLock::from(page.hash),
                header_hash: OnceLock::new(),
            }));
        }
        let mut collection = Self {
            pages: Arc::new(values),
            index: Arc::new(IdIndex::default()),
            loader: Some(loader),
            len: 0,
            ..Self::default()
        };
        collection.reindex();
        collection.initialize_identities();
        collection.validate_index()?;
        Ok(collection)
    }
    pub(crate) fn reindex(&mut self) {
        let mut index = IdIndex::default();
        let mut len = 0;
        for (page_index, page) in self.pages.iter().enumerate() {
            for (item, header) in page.headers.iter().enumerate() {
                let id = header.id();
                if index
                    .locations
                    .insert(
                        id,
                        Location {
                            page: page_index,
                            item,
                        },
                    )
                    .is_some()
                {
                    index.duplicates.insert(id);
                }
                len += 1;
            }
        }
        self.index = Arc::new(index);
        self.len = len;
    }
}
pub(crate) fn validate_hash(hash: &str) -> Result<()> {
    if hash.len() != 64
        || !hash
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err(invalid("invalid decision block reference"));
    }
    Ok(())
}
impl<T: PersistentItem> From<Vec<T>> for PersistentCollection<T> {
    fn from(values: Vec<T>) -> Self {
        let cells: Vec<_> = values.into_iter().map(Arc::new).collect();
        let pages = cells
            .chunks(PAGE_SIZE)
            .map(|chunk| loaded_page(chunk.to_vec()))
            .collect();
        let mut result = Self {
            pages: Arc::new(pages),
            ..Self::default()
        };
        result.reindex();
        result.initialize_identities();
        result
    }
}
