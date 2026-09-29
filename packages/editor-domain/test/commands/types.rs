use beam_editor_domain::{
    animation::{Interpolation, Value},
    commands::types::{Command, Operation, Reference, Transaction},
    timing::{Time, TimeSpace},
};
use uuid::Uuid;

#[test]
fn references_use_stable_ids_or_explicit_created_by_links() {
    let id = Uuid::new_v4();
    let encoded = serde_json::to_value(Reference::Created {
        index: 0,
        created_by: "insert".into(),
    })
    .unwrap();
    assert_eq!(
        encoded,
        serde_json::json!({ "createdBy": "insert", "index": 0 })
    );
    assert!(
        matches!(serde_json::from_value::<Reference>(serde_json::json!(id)).unwrap(), Reference::Id(actual) if actual == id)
    );
    assert!(serde_json::from_value::<Reference>(serde_json::json!({ "createdBy": "" })).is_ok());
}

#[test]
fn keyframe_operations_have_typed_wire_discriminators_and_reject_unknown_fields() {
    let operation = Operation::KeyframeAdd {
        clip: Reference::Id(Uuid::new_v4()),
        instance: Reference::Created {
            index: 0,
            created_by: "fx".into(),
        },
        parameter: "opacity".into(),
        space: TimeSpace::ClipLocal,
        time: Time::milliseconds(500),
        value: Value::Number(0.5),
        interpolation: Interpolation::Linear,
    };
    let encoded = serde_json::to_value(&operation).unwrap();
    assert_eq!(encoded["type"], "keyframeAdd");
    assert_eq!(encoded["instance"]["createdBy"], "fx");
    let decoded = serde_json::from_value::<Operation>(encoded.clone()).unwrap();
    assert_eq!(
        serde_json::to_value(decoded).unwrap(),
        serde_json::to_value(operation).unwrap()
    );
    let mut invalid = encoded;
    invalid["unexpected"] = serde_json::json!(true);
    assert!(serde_json::from_value::<Operation>(invalid).is_err());
}

#[test]
fn transaction_contract_round_trips_revision_sequence_and_idempotency_metadata() {
    let transaction = Transaction {
        api_version: 1,
        project_id: Uuid::new_v4(),
        sequence_id: Uuid::new_v4(),
        expected_revision: 7,
        idempotency_key: "stable-request".into(),
        commands: vec![Command {
            command_id: "edit-1".into(),
            operation: Operation::Edit {
                edit: beam_editor_domain::Edit::Rename { name: "Cut".into() },
            },
        }],
    };
    let encoded = serde_json::to_vec(&transaction).unwrap();
    let decoded: Transaction = serde_json::from_slice(&encoded).unwrap();
    assert_eq!(decoded.project_id, transaction.project_id);
    assert_eq!(decoded.sequence_id, transaction.sequence_id);
    assert_eq!(decoded.expected_revision, 7);
    assert_eq!(decoded.idempotency_key, "stable-request");
    assert_eq!(decoded.commands[0].command_id, "edit-1");
}
