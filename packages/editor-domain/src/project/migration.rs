//! V1 reading is explicit and never modifies media or invents edit history.
use crate::{Document, EditorError, Result};

pub fn migrate(mut document: Document) -> Result<Document> {
    if document.schema_version > super::types::DOCUMENT_VERSION || document.schema_version == 0 {
        return Err(EditorError::UnsupportedVersion(document.schema_version));
    }
    if document.schema_version == 1 {
        crate::recording::decisions::migrate_document(&mut document)?;
        crate::effects::migration::migrate_document(&mut document)?;
        document.schema_version = super::types::DOCUMENT_VERSION;
        // Both conversions retain source-time decisions and deterministic history identities.
    }
    crate::timeline::sequences::synchronize(&mut document);
    if document.event_journal.is_none() {
        document.event_journal = Some(crate::commands::event_types::EventJournal::from_receipts(
            document.revision,
            &document.receipts,
        ));
    }
    crate::commands::events::validate(&document)?;
    super::validation::document(&document)?;
    Ok(document)
}
