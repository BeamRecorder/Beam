use super::*;
#[test]
fn identity_index_is_shared_updated_and_restores_uniqueness_without_payload_scans() {
    let mut values = collection(300);
    let history = values.clone();
    assert!(values.shares_identities(&history));
    values.validate_identities().unwrap();
    assert_eq!(values.identity_count(Item::new(1).id), 1);
    values.try_by_id_mut(Item::new(1).id).unwrap().unwrap().id = Uuid::nil();
    assert!(values.validate_identities().is_err());
    assert_eq!(values.identity_count(Uuid::nil()), 1);
    assert_eq!(history.identity_count(Uuid::nil()), 0);
    values.try_remove(Uuid::nil()).unwrap();
    values.validate_identities().unwrap();
    values.try_extend([Item::new(500)]).unwrap();
    assert_eq!(values.identity_count(Item::new(500).id), 1);
    values.try_insert(1, Item::new(501)).unwrap();
    assert_eq!(values.identity_count(Item::new(501).id), 1);
    values
        .try_retain(|header| header.id != Item::new(501).id)
        .unwrap();
    assert_eq!(values.identity_count(Item::new(501).id), 0);
    assert!(values.shares_identities(&values.clone()));
}
