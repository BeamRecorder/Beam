use beam_editor_domain::{
    Document, Edit, Project,
    commands::{self, event_types::EventJournal, events},
    protocol::Event,
};

fn document() -> Document {
    Document::new(Project::new("Events".into()))
}
fn event(revision: u64, sequence_id: uuid::Uuid) -> Event {
    Event {
        revision,
        sequence_id,
        command_ids: vec![],
    }
}

#[test]
fn imports_transactions_and_retries_share_one_persistent_event_stream() {
    let mut document = document();
    document.revision = 1;
    events::record_import(&mut document).unwrap();
    assert!(document.receipts.is_empty());
    let transaction = commands::single(
        &document,
        Edit::Rename {
            name: "Transaction".into(),
        },
    );
    let prepared = commands::prepare(&document, &transaction).unwrap();
    let replay = commands::prepare(&prepared.document, &transaction).unwrap();
    assert!(replay.replay);
    assert_eq!(
        replay.document.event_journal,
        prepared.document.event_journal
    );
    let page = events::read(&prepared.document, 0, 1).unwrap();
    assert_eq!(page.total, 2);
    assert_eq!(page.next, Some(1));
    assert!(page.items[0].command_ids.is_empty());
    assert_eq!(
        events::read(&prepared.document, 1, 256).unwrap().items[0].command_ids,
        vec!["edit"]
    );
    let root = tempfile::tempdir().unwrap();
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    store.write(&prepared.document).unwrap();
    let (loaded, recovered) = store.read().unwrap();
    assert!(!recovered);
    assert_eq!(loaded.event_journal, prepared.document.event_journal);
    assert_eq!(
        events::read(&loaded, 0, 256).unwrap().items,
        events::read(&prepared.document, 0, 256).unwrap().items
    );
    let before = document.clone();
    let invalid = commands::single(&document, Edit::Rename { name: "".into() });
    assert!(commands::prepare(&document, &invalid).is_err());
    assert_eq!(document, before);
}

#[test]
fn retention_paging_future_cursors_and_missing_changes_are_explicit() {
    let mut document = document();
    for revision in 1..=130 {
        document.revision = revision;
        events::record_import(&mut document).unwrap();
    }
    let journal = document.event_journal.as_ref().unwrap();
    assert_eq!(journal.after_revision, 2);
    assert_eq!(journal.entries.len(), events::EVENT_RETENTION);
    assert!(
        events::read(&document, 1, 1)
            .unwrap_err()
            .to_string()
            .contains("expired")
    );
    assert!(events::read(&document, 131, 1).is_err());
    assert_eq!(
        events::read(&document, 129, 1).unwrap().items[0].revision,
        130
    );
    assert!(events::read(&document, 130, 1).unwrap().items.is_empty());
    for limit in [0, 257] {
        assert!(events::read(&document, 130, limit).is_err());
    }
    document.revision += 1;
    assert!(
        events::read(&document, 130, 1)
            .unwrap_err()
            .to_string()
            .contains("unrecorded")
    );
    document.revision += 1;
    events::record_import(&mut document).unwrap();
    assert!(events::read(&document, 130, 1).is_err());
    assert_eq!(
        events::read(&document, 131, 1).unwrap().items[0].revision,
        132
    );
    let before = document.clone();
    assert!(events::record_import(&mut document).is_err());
    assert_eq!(document, before);
    assert!(events::record_import(&mut self::document()).is_err());
}

#[test]
fn legacy_receipts_only_restore_a_contiguous_suffix_and_never_invent_imports() {
    let mut document = document();
    for name in ["One", "Two", "Three", "Four"] {
        document = commands::prepare(
            &document,
            &commands::single(&document, Edit::Rename { name: name.into() }),
        )
        .unwrap()
        .document;
    }
    document.receipts.remove(1);
    document.event_journal = None;
    let migrated = EventJournal::from_receipts(document.revision, &document.receipts);
    assert_eq!(migrated.after_revision, 2);
    assert_eq!(
        migrated
            .entries
            .iter()
            .map(|event| event.revision)
            .collect::<Vec<_>>(),
        vec![3, 4]
    );
    assert!(events::read(&document, 1, 1).is_err());
    assert_eq!(events::read(&document, 2, 256).unwrap().total, 2);
    let next = commands::prepare(
        &document,
        &commands::single(
            &document,
            Edit::Rename {
                name: "Five".into(),
            },
        ),
    )
    .unwrap()
    .document;
    assert_eq!(events::read(&next, 2, 256).unwrap().items.len(), 3);
    document.revision = 5;
    assert!(events::read(&document, 4, 1).is_err());
    assert!(events::read(&document, 5, 1).unwrap().items.is_empty());
    let mut value = serde_json::to_value(&document).unwrap();
    value.as_object_mut().unwrap().remove("eventJournal");
    let migrated =
        beam_editor_domain::project::migration::migrate(serde_json::from_value(value).unwrap())
            .unwrap();
    assert_eq!(migrated.event_journal.unwrap().after_revision, 5);
    let root = tempfile::tempdir().unwrap();
    let mut index = beam_editor_domain::project::blocks::index(root.path(), &next).unwrap();
    index.event_journal = None;
    let loaded = beam_editor_domain::project::blocks::load(root.path(), index).unwrap();
    assert_eq!(events::read(&loaded, 2, 256).unwrap().total, 3);
}

#[test]
fn corrupt_order_scope_commands_and_receipt_revisions_are_rejected_without_mutation() {
    let mut document = document();
    document.revision = 1;
    let valid = EventJournal {
        after_revision: 0,
        entries: vec![event(1, document.active_sequence)],
    };
    for case in 0..8 {
        let mut bad = valid.clone();
        match case {
            0 => bad.after_revision = 2,
            1 => bad.entries[0].revision = 0,
            2 => bad.entries[0].sequence_id = uuid::Uuid::nil(),
            3 => bad.entries[0].command_ids = vec!["".into()],
            4 => bad.entries[0].command_ids = vec!["same".into(), "same".into()],
            5 => bad.entries[0].command_ids = vec!["x".repeat(129)],
            6 => {
                bad.entries = vec![event(1, document.active_sequence); events::EVENT_RETENTION + 1]
            }
            _ => bad.entries[0].command_ids = (0..513).map(|index| index.to_string()).collect(),
        }
        document.event_journal = Some(bad);
        assert!(events::validate(&document).is_err());
        assert!(events::read(&document, 1, 1).is_err());
    }
    document.event_journal = Some(valid);
    let mut receipt = commands::prepare(
        &document,
        &commands::single(&document, Edit::Rename { name: "Two".into() }),
    )
    .unwrap()
    .receipt;
    let before = document.clone();
    receipt.revision = 3;
    assert!(events::record_transaction(&mut document, &receipt).is_err());
    assert_eq!(document, before);
}
