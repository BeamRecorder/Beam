//! Independent immutable payload/header references; unchanged pages need no serialization.
use super::blocks::{get, put};
use crate::{
    Result,
    collections::{PageCache, PageReference, PersistentCollection, PersistentItem},
};
use std::{path::Path, sync::Arc};

fn exists(root: &Path, hash: &str) -> Result<bool> {
    let relative = format!(".editor/blocks/{hash}.json");
    if !root.join(&relative).exists() {
        return Ok(false);
    }
    super::validation::source_path(root, &relative).map(|_| true)
}
pub fn store<T: PersistentItem>(
    root: &Path,
    values: &PersistentCollection<T>,
) -> Result<Vec<PageReference>> {
    let mut references = Vec::with_capacity(values.page_count());
    for index in 0..values.page_count() {
        let headers = match values.page_header_hash(index)? {
            Some(hash) if exists(root, hash)? => hash.to_owned(),
            _ => {
                let hash = put(root, &values.page_headers(index)?)?;
                values.cache_page_header_hash(index, hash.clone())?;
                hash
            }
        };
        let content = match values.page_hash(index)? {
            Some(hash) if exists(root, hash)? => hash.to_owned(),
            _ => {
                let hash = put(root, &values.try_page_values(index)?)?;
                values.cache_page_hash(index, hash.clone())?;
                hash
            }
        };
        references.push(PageReference {
            values: content,
            headers,
        });
    }
    Ok(references)
}
pub fn load<T: PersistentItem>(
    root: &Path,
    references: &[PageReference],
    cache: &PageCache<T>,
) -> Result<PersistentCollection<T>> {
    let root = root.to_owned();
    let source = root.clone();
    PersistentCollection::from_page_refs(
        references,
        |hash| get(&root, hash),
        Arc::new(move |hash| {
            get::<Vec<T>>(&source, hash)
                .map(|values| Arc::new(values.into_iter().map(Arc::new).collect()))
        }),
        cache,
    )
}
