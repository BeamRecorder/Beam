use super::*;
#[test]
fn change_projection_reports_only_changed_added_removed_items() {
    let mut next = collection(300);
    let before = next.clone();
    assert!(next.try_changed_ids(&before).unwrap().is_empty());
    next.try_by_id_mut(Item::new(140).id)
        .unwrap()
        .unwrap()
        .payload[0] = 8;
    assert_eq!(
        next.try_changed_ids(&before).unwrap(),
        vec![Item::new(140).id]
    );
    next.try_push(Item::new(500)).unwrap();
    next.try_remove(Item::new(0).id).unwrap();
    assert_eq!(
        next.try_changed_ids(&before).unwrap(),
        vec![Item::new(0).id, Item::new(140).id, Item::new(500).id]
    );
    let mut unchanged = before.clone();
    unchanged.try_by_id_mut(Item::new(1).id).unwrap();
    assert!(unchanged.try_changed_ids(&before).unwrap().is_empty());
}
#[test]
fn untouched_lazy_pages_remain_unloaded_during_change_projection() {
    let loads = Arc::new(AtomicUsize::new(0));
    let before = lazy(300, loads.clone());
    let mut next = before.clone();
    next.try_by_id_mut(Item::new(140).id)
        .unwrap()
        .unwrap()
        .payload[0] = 8;
    assert_eq!(
        next.try_changed_ids(&before).unwrap(),
        vec![Item::new(140).id]
    );
    assert_eq!(loads.load(Ordering::SeqCst), 1);
}
