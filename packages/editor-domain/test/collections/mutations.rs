use super::*;
#[test]
fn insertion_removal_and_bulk_append_preserve_order_and_ids() {
    let mut values = collection(128);
    let history = values.clone();
    values.try_insert(1, Item::new(500)).unwrap();
    assert_eq!(values.headers().nth(1).unwrap().id, Item::new(500).id);
    assert_eq!(values.page_count(), 2);
    values.try_push(Item::new(501)).unwrap();
    values.try_extend((502..1000).map(Item::new)).unwrap();
    assert_eq!(values.len(), 628);
    values.validate_index().unwrap();
    assert_eq!(
        values.try_remove(Item::new(500).id).unwrap().unwrap().id,
        Item::new(500).id
    );
    assert!(values.try_remove(Uuid::new_v4()).unwrap().is_none());
    assert_eq!(history.len(), 128);
    let mut single = collection(1);
    single.try_remove(Item::new(0).id).unwrap();
    assert!(single.is_empty());
    single.try_insert(0, Item::new(4)).unwrap();
    assert_eq!(single.len(), 1);
}
#[test]
fn failed_mutations_do_not_publish_partial_bulk_changes() {
    let mut values = collection(2);
    let original = values.clone();
    assert!(values.try_extend([Item::new(10), Item::new(0)]).is_err());
    assert!(values.try_extend([Item::new(10), Item::new(10)]).is_err());
    values.try_extend([]).unwrap();
    assert!(values.try_insert(3, Item::new(3)).is_err());
    let mut nil = Item::new(4);
    nil.id = Uuid::nil();
    assert!(values.try_push(nil).is_err());
    assert_eq!(values, original);
    let mut duplicate: PersistentCollection<_> = vec![Item::new(1), Item::new(1)].into();
    assert!(duplicate.try_remove(Item::new(1).id).is_err());
}
#[test]
fn retain_uses_headers_and_drops_whole_lazy_pages_without_loading() {
    let loads = Arc::new(AtomicUsize::new(0));
    let mut values = lazy(300, loads.clone());
    let history = values.clone();
    values
        .try_retain(|header| header.id.as_u128() > 128)
        .unwrap();
    assert_eq!(values.len(), 172);
    assert_eq!(loads.load(Ordering::SeqCst), 0);
    values
        .try_retain(|header| header.id.as_u128() % 2 == 0)
        .unwrap();
    assert_eq!(values.len(), 86);
    assert_eq!(loads.load(Ordering::SeqCst), 2);
    assert_eq!(history.len(), 300);
    values.validate_index().unwrap();
    values.try_retain(|_| false).unwrap();
    assert!(values.is_empty());
}
#[test]
fn corrupt_lazy_page_prevents_atomic_retain_and_append_removal() {
    let mut values = PersistentCollection::<Item>::from_lazy(
        vec![LazyPage {
            hash: "a".repeat(64),
            headers: vec![Item::new(0).header(), Item::new(1).header()],
        }],
        Arc::new(|_| Err(beam_editor_domain::EditorError::Invalid("corrupt".into()))),
    )
    .unwrap();
    let history = values.clone();
    assert!(
        values
            .try_retain(|header| header.id == Item::new(0).id)
            .is_err()
    );
    assert!(values.try_remove(Item::new(0).id).is_err());
    assert!(values.try_push(Item::new(2)).is_err());
    assert!(values.try_insert(1, Item::new(2)).is_err());
    assert_eq!(values.shared_pages(&history), 1);
    assert_eq!(values.len(), 2);
}
