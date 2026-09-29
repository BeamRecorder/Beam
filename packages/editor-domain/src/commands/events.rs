//! Atomic transactions and imports share a revisioned journal, never fictitious receipts.
use super::{
    event_types::EventJournal,
    types::{Page, Receipt},
};
use crate::{Document, EditorError, Result, protocol::Event};
use std::collections::HashSet;

pub const EVENT_RETENTION: usize = 128;

impl EventJournal {
    pub fn last_revision(&self) -> u64 {
        self.entries
            .last()
            .map_or(self.after_revision, |event| event.revision)
    }
    /// Temporary history candidates may have a newer revision than the published journal.
    pub fn validate(&self, revision: u64) -> Result<()> {
        if self.after_revision > revision || self.entries.len() > EVENT_RETENTION {
            return invalid("event journal revision or retention is invalid");
        }
        let mut previous = self.after_revision;
        for event in &self.entries {
            if previous.checked_add(1) != Some(event.revision)
                || event.revision > revision
                || event.sequence_id.is_nil()
                || event.command_ids.len() > super::MAX_COMMANDS
            {
                return invalid("event journal order or scope is invalid");
            }
            let mut commands = HashSet::new();
            if event
                .command_ids
                .iter()
                .any(|id| id.is_empty() || id.len() > 128 || !commands.insert(id))
            {
                return invalid("event command IDs must be unique and bounded");
            }
            previous = event.revision;
        }
        Ok(())
    }
    /// Only a contiguous suffix ending at the current revision can represent legacy changes.
    pub fn from_receipts(revision: u64, receipts: &[Receipt]) -> Self {
        let mut expected = revision;
        let mut entries = Vec::new();
        for receipt in receipts.iter().rev() {
            if entries.len() == EVENT_RETENTION || receipt.revision != expected || expected == 0 {
                break;
            }
            entries.push(Event {
                revision: receipt.revision,
                sequence_id: receipt.sequence_id,
                command_ids: receipt
                    .results
                    .iter()
                    .map(|result| result.command_id.clone())
                    .collect(),
            });
            expected -= 1;
        }
        entries.reverse();
        Self {
            after_revision: expected,
            entries,
        }
    }
}

pub fn validate(document: &Document) -> Result<()> {
    if let Some(journal) = &document.event_journal {
        journal.validate(document.revision)?;
    }
    Ok(())
}

pub fn record_transaction(document: &mut Document, receipt: &Receipt) -> Result<()> {
    if receipt.revision != document.revision {
        return invalid("transaction event revision differs from its receipt");
    }
    record(
        document,
        Event {
            revision: receipt.revision,
            sequence_id: receipt.sequence_id,
            command_ids: receipt
                .results
                .iter()
                .map(|result| result.command_id.clone())
                .collect(),
        },
    )
}

/// Call after the native importer prepares its candidate, before publishing its checkpoint.
pub fn record_import(document: &mut Document) -> Result<()> {
    let event = Event {
        revision: document.revision,
        sequence_id: document.active_sequence,
        command_ids: vec![],
    };
    record(document, event)
}

fn record(document: &mut Document, event: Event) -> Result<()> {
    let previous = document.revision.checked_sub(1).ok_or_else(|| {
        EditorError::Invalid("a change event requires a published revision".into())
    })?;
    let mut journal = document
        .event_journal
        .clone()
        .unwrap_or_else(|| EventJournal::from_receipts(previous, &document.receipts));
    journal.validate(document.revision)?;
    if journal.last_revision() > previous {
        return invalid("this revision already has a change event");
    }
    if journal.last_revision() < previous {
        // A legacy/direct history path omitted changes; retaining its earlier cursor would lie.
        journal = EventJournal {
            after_revision: previous,
            entries: vec![],
        };
    }
    journal.entries.push(event);
    if journal.entries.len() > EVENT_RETENTION {
        journal.after_revision = journal.entries.remove(0).revision;
    }
    journal.validate(document.revision)?;
    document.event_journal = Some(journal);
    Ok(())
}

pub fn read(document: &Document, after_revision: u64, limit: usize) -> Result<Page<Event>> {
    let legacy;
    let journal = match &document.event_journal {
        Some(journal) => journal,
        None => {
            legacy = EventJournal::from_receipts(document.revision, &document.receipts);
            &legacy
        }
    };
    journal.validate(document.revision)?;
    if after_revision > document.revision {
        return invalid("event cursor is newer than the document revision");
    }
    if after_revision < journal.after_revision {
        return invalid("event cursor expired; refresh paged state");
    }
    if journal.last_revision() != document.revision {
        return invalid("event journal has an unrecorded change; refresh paged state");
    }
    let events: Vec<_> = journal
        .entries
        .iter()
        .filter(|event| event.revision > after_revision)
        .cloned()
        .collect();
    super::query::page(document.revision, &events, 0, limit)
}

fn invalid<T>(message: &str) -> Result<T> {
    Err(EditorError::Invalid(message.into()))
}
