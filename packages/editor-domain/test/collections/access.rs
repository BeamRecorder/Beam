use super::*;
#[test]
fn one_parameter_edit_detaches_one_item_and_preserves_history() {
    let mut values = collection(300);
    let history = values.clone();
    let original = history.try_by_id(Item::new(140).id).unwrap().unwrap();
    let untouched = history.try_by_id(Item::new(141).id).unwrap().unwrap();
    values.cache_page_hash(1, "a".repeat(64)).unwrap();
    {
        let mut item = values.try_by_id_mut(original.id).unwrap().unwrap();
        item.payload[0] = 8;
        item.label = "edited".into();
    }
    assert_eq!(original.payload[0], 7);
    assert_eq!(original.clones.load(Ordering::SeqCst), 1);
    assert_eq!(values.shared_pages(&history), 2);
    assert!(values.shares_index(&history));
    assert!(Arc::ptr_eq(
        &untouched,
        &values.try_by_id(untouched.id).unwrap().unwrap()
    ));
    assert_eq!(values.headers().nth(140).unwrap().label, "edited");
    assert_eq!(values.page_hash(1).unwrap(), None);
    assert_eq!(history.page_hash(1).unwrap(), Some("a".repeat(64).as_str()));
    assert!(values.try_by_id(Uuid::new_v4()).unwrap().is_none());
    assert!(values.try_by_id_mut(Uuid::new_v4()).unwrap().is_none());
}
#[test]
fn validation_targets_only_dirty_items_and_checkpoint_hash_clears_flags() {
    let mut values = collection(300);
    assert_eq!(values.try_dirty_items().count(), 300);
    for page in 0..values.page_count() {
        values
            .cache_page_hash(page, format!("{page:064x}"))
            .unwrap();
    }
    assert_eq!(values.try_dirty_items().count(), 0);
    let history = values.clone();
    let id = Item::new(140).id;
    values.try_by_id_mut(id).unwrap().unwrap().payload[0] = 9;
    let dirty = values
        .try_dirty_items()
        .collect::<beam_editor_domain::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(dirty.len(), 1);
    assert_eq!(dirty[0].id, id);
    assert_eq!(history.try_dirty_items().count(), 0);
    values.cache_page_hash(1, "a".repeat(64)).unwrap();
    assert_eq!(values.try_dirty_items().count(), 0);
}
#[test]
fn id_changes_update_the_shared_index_and_reject_duplicate_lookups() {
    let mut values = collection(2);
    let history = values.clone();
    let old = Item::new(0).id;
    let replacement = Uuid::new_v4();
    values.try_by_id_mut(old).unwrap().unwrap().id = replacement;
    assert!(values.try_by_id(old).unwrap().is_none());
    assert!(values.try_by_id(replacement).unwrap().is_some());
    assert!(history.try_by_id(old).unwrap().is_some());
    assert!(!values.shares_index(&history));
    values.try_by_id_mut(replacement).unwrap().unwrap().id = Item::new(1).id;
    assert!(values.validate_index().is_err());
    assert!(values.try_by_id_mut(Item::new(1).id).is_err());
}
#[test]
fn bounded_pages_load_only_the_pages_they_touch() {
    let loads = Arc::new(AtomicUsize::new(0));
    let values = lazy(300, loads.clone());
    let page = values.try_page(140, 2).unwrap();
    assert_eq!(page[0].id, Item::new(140).id);
    assert_eq!(values.loaded_pages(), 1);
    assert_eq!(loads.load(Ordering::SeqCst), 1);
    assert!(values.try_page(300, 10).unwrap().is_empty());
    assert!(values.try_page(301, 1).is_err());
    assert!(values.try_page(0, 0).is_err());
    assert!(values.try_page_values(3).is_err());
    assert_eq!(values.try_page(299, usize::MAX).unwrap().len(), 1);
    assert_eq!(
        values
            .try_iter()
            .collect::<beam_editor_domain::Result<Vec<_>>>()
            .unwrap()
            .len(),
        300
    );
    assert_eq!(loads.load(Ordering::SeqCst), 3);
}
#[test]
fn concurrent_readers_load_each_shared_page_once() {
    let loads = Arc::new(AtomicUsize::new(0));
    let values = lazy(200, loads.clone());
    std::thread::scope(|scope| {
        for _ in 0..8 {
            let values = &values;
            scope.spawn(move || assert_eq!(values.try_page(0, 1).unwrap().len(), 1));
        }
    });
    assert_eq!(loads.load(Ordering::SeqCst), 1);
}
#[test]
fn corrupt_or_unavailable_payloads_return_contextual_errors() {
    for mode in 0..3 {
        let header = Item::new(0).header();
        let values = PersistentCollection::<Item>::from_lazy(
            vec![LazyPage {
                hash: "a".repeat(64),
                headers: vec![header],
            }],
            Arc::new(move |_| match mode {
                0 => Err(beam_editor_domain::EditorError::Invalid(
                    "missing file".into(),
                )),
                1 => Ok(Arc::new(vec![])),
                _ => Ok(Arc::new(vec![Arc::new(Item::new(1))])),
            }),
        )
        .unwrap();
        let error = values.try_by_id(Item::new(0).id).unwrap_err().to_string();
        assert!(error.contains(&"a".repeat(64)));
        assert_eq!(values.loaded_pages(), 0);
        let mut edited = values.clone();
        assert!(edited.try_by_id_mut(Item::new(0).id).is_err());
    }
}
