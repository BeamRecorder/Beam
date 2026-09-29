use super::{
    PageCache, PageLoader, PageReference, PersistentCollection, PersistentItem, Result, invalid,
    validate_hash,
};
use std::sync::{Arc, Mutex, OnceLock};

impl<T: PersistentItem> PersistentCollection<T> {
    pub fn page_header_hash(&self, index: usize) -> Result<Option<&str>> {
        self.pages
            .get(index)
            .map(|page| page.header_hash.get().map(String::as_str))
            .ok_or_else(|| invalid("missing decision page"))
    }
    pub fn cache_page_header_hash(&self, index: usize, hash: String) -> Result<()> {
        validate_hash(&hash)?;
        let page = self
            .pages
            .get(index)
            .ok_or_else(|| invalid("missing decision page"))?;
        if page
            .header_hash
            .get()
            .is_some_and(|existing| existing != &hash)
        {
            return Err(invalid(
                "decision header hash differs from immutable content",
            ));
        }
        let _ = page.header_hash.set(hash);
        Ok(())
    }
    /// Headers are decoded once per content pair; effect payloads stay unloaded.
    pub fn from_page_refs(
        references: &[PageReference],
        mut read_headers: impl FnMut(&str) -> Result<Vec<T::Header>>,
        loader: PageLoader<T>,
        cache: &PageCache<T>,
    ) -> Result<Self> {
        let mut pages = Vec::with_capacity(references.len());
        for reference in references {
            validate_hash(&reference.values)?;
            validate_hash(&reference.headers)?;
            let key = (reference.values.clone(), reference.headers.clone());
            let mut cached = cache
                .pages
                .lock()
                .map_err(|_| invalid("decision page cache stopped"))?;
            let page = match cached.get(&key).and_then(std::sync::Weak::upgrade) {
                Some(page) => page,
                None => {
                    let mut header_cache = cache
                        .headers
                        .lock()
                        .map_err(|_| invalid("decision header cache stopped"))?;
                    let headers = match header_cache
                        .get(&reference.headers)
                        .and_then(std::sync::Weak::upgrade)
                    {
                        Some(headers) => headers,
                        None => {
                            let headers = read_headers(&reference.headers).map_err(|error| {
                                invalid(format!("decision headers {}: {error}", reference.headers))
                            })?;
                            if headers.is_empty() || headers.len() > super::PAGE_SIZE {
                                return Err(invalid("decision page requires 1–128 headers"));
                            }
                            let headers = Arc::new(headers.into_iter().map(Arc::new).collect());
                            header_cache
                                .insert(reference.headers.clone(), Arc::downgrade(&headers));
                            headers
                        }
                    };
                    let page = Arc::new(super::types::DecisionPage {
                        dirty: (0..headers.len())
                            .map(|_| std::sync::atomic::AtomicBool::new(false))
                            .collect(),
                        headers,
                        values: OnceLock::new(),
                        load_lock: Mutex::new(()),
                        hash: OnceLock::from(reference.values.clone()),
                        header_hash: OnceLock::from(reference.headers.clone()),
                    });
                    cached.insert(key, Arc::downgrade(&page));
                    page
                }
            };
            pages.push(page);
        }
        let index_key = references
            .iter()
            .map(|reference| reference.headers.clone())
            .collect::<Vec<_>>();
        let mut result = Self {
            len: pages.iter().map(|page| page.headers.len()).sum(),
            pages: Arc::new(pages),
            loader: Some(loader),
            ..Self::default()
        };
        let mut indexes = cache
            .indexes
            .lock()
            .map_err(|_| invalid("decision index cache stopped"))?;
        let shared = indexes.get(&index_key).and_then(|cached| {
            Some((
                cached.index.upgrade()?,
                cached.identities.upgrade()?,
                cached.validation.upgrade()?,
            ))
        });
        if let Some((index, identities, validation)) = shared {
            result.index = index;
            result.identities = identities;
            result.header_validation = validation;
        } else {
            result.reindex();
            result.validate_index()?;
            result.initialize_identities();
            indexes.insert(
                index_key,
                super::types::CachedIndexes {
                    index: Arc::downgrade(&result.index),
                    identities: Arc::downgrade(&result.identities),
                    validation: Arc::downgrade(&result.header_validation),
                },
            );
        }
        Ok(result)
    }
}
