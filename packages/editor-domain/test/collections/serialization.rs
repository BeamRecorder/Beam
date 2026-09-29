use super::*;
#[test]
fn json_and_schema_preserve_the_public_array_shape() {
    let values = collection(3);
    let bytes = serde_json::to_vec(&values).unwrap();
    let decoded: PersistentCollection<Item> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(values, decoded);
    let schema = serde_json::to_value(schemars::schema_for!(PersistentCollection<Item>)).unwrap();
    assert_eq!(schema["type"], "array");
    assert_eq!(
        serde_json::from_slice::<Vec<Item>>(&bytes).unwrap().len(),
        3
    );
    assert_ne!(values, collection(2));
    let mut edited = values.clone();
    edited
        .try_by_id_mut(Item::new(0).id)
        .unwrap()
        .unwrap()
        .payload[0] = 99;
    assert_ne!(values, edited);
    assert!(serde_json::from_slice::<PersistentCollection<Item>>(b"{}").is_err());
}
#[test]
fn serialization_keeps_lazy_errors_and_equal_verified_hashes_do_not_load() {
    let build = || {
        PersistentCollection::<Item>::from_lazy(
            vec![LazyPage {
                hash: "a".repeat(64),
                headers: vec![Item::new(0).header()],
            }],
            Arc::new(|_| Err(beam_editor_domain::EditorError::Invalid("offline".into()))),
        )
        .unwrap()
    };
    let left = build();
    let right = build();
    assert_eq!(left, right);
    assert!(
        serde_json::to_value(&left)
            .unwrap_err()
            .to_string()
            .contains("offline")
    );
    let other = PersistentCollection::<Item>::from_lazy(
        vec![LazyPage {
            hash: "b".repeat(64),
            headers: vec![Item::new(0).header()],
        }],
        Arc::new(|_| unreachable!()),
    )
    .unwrap();
    assert_ne!(left, other);
}
