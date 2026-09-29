use super::{PersistentCollection, PersistentItem, Result};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
impl<T: PersistentItem> PersistentCollection<T> {
    /// The caller's key covers asset/catalog/track context; only successful validation is reused.
    pub fn try_validate_headers(
        &self,
        context: &str,
        validate: impl FnOnce() -> Result<()>,
    ) -> Result<()> {
        let mut contexts = self
            .header_validation
            .lock()
            .map_err(|_| crate::EditorError::Stopped)?;
        if contexts.contains(context) {
            return Ok(());
        }
        validate()?;
        // Eight distinct contexts bound metadata cache growth without affecting documents.
        if contexts.len() >= 8 {
            contexts.clear();
        }
        contexts.insert(context.to_owned());
        Ok(())
    }
    pub(crate) fn clear_header_validation(&mut self) {
        self.header_validation = Arc::new(Mutex::new(HashSet::new()));
    }
}
