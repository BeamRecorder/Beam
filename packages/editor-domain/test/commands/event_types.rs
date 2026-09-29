use beam_editor_domain::{commands::event_types::EventJournal, protocol::Event};

#[test]
fn event_journal_round_trips_empty_import_commands_and_rejects_extra_fields() {
    let journal = EventJournal {
        after_revision: 4,
        entries: vec![Event {
            revision: 5,
            sequence_id: uuid::Uuid::new_v4(),
            command_ids: vec![],
        }],
    };
    let value = serde_json::to_value(&journal).unwrap();
    assert_eq!(value["afterRevision"], 4);
    assert_eq!(value["entries"][0]["commandIds"], serde_json::json!([]));
    assert_eq!(
        serde_json::from_value::<EventJournal>(value).unwrap(),
        journal
    );
    assert!(
        serde_json::from_str::<EventJournal>(r#"{"afterRevision":0,"entries":[],"paths":[]}"#)
            .is_err()
    );
    assert_eq!(EventJournal::default().last_revision(), 0);
}
