use super::*;
#[test]
fn reconstructed_histories_share_headers_payload_cells_and_id_index() {
    let cache = PageCache::default();
    let values = collection(256);
    let headers = Arc::new(AtomicUsize::new(0));
    let loads = Arc::new(AtomicUsize::new(0));
    let references = vec![
        PageReference {
            values: "a".repeat(64),
            headers: "b".repeat(64),
        },
        PageReference {
            values: "c".repeat(64),
            headers: "d".repeat(64),
        },
    ];
    let mut states = vec![];
    for _ in 0..50 {
        let loads = loads.clone();
        let values = values.clone();
        let header_values = values.clone();
        states.push(
            PersistentCollection::<Item>::from_page_refs(
                &references,
                |hash| {
                    headers.fetch_add(1, Ordering::SeqCst);
                    let page = if hash.starts_with('b') { 0 } else { 1 };
                    Ok(header_values
                        .page_headers(page)?
                        .iter()
                        .map(|header| (**header).clone())
                        .collect())
                },
                Arc::new(move |hash| {
                    loads.fetch_add(1, Ordering::SeqCst);
                    values.try_page_values(if hash.starts_with('a') { 0 } else { 1 })
                }),
                &cache,
            )
            .unwrap(),
        );
    }
    assert_eq!(headers.load(Ordering::SeqCst), 2);
    assert_eq!(loads.load(Ordering::SeqCst), 0);
    assert_eq!(states[0].shared_pages(&states[49]), 2);
    assert!(states[0].shares_index(&states[49]));
    for state in &states {
        state.try_by_id(Item::new(140).id).unwrap();
    }
    assert_eq!(loads.load(Ordering::SeqCst), 1);
    assert_eq!(
        states[0].page_header_hash(0).unwrap(),
        Some("b".repeat(64).as_str())
    );
    let mut edited = states[0].clone();
    edited
        .try_by_id_mut(Item::new(140).id)
        .unwrap()
        .unwrap()
        .payload[0] = 8;
    assert_eq!(
        edited.page_header_hash(1).unwrap(),
        Some("d".repeat(64).as_str())
    );
    edited
        .try_by_id_mut(Item::new(140).id)
        .unwrap()
        .unwrap()
        .label = "changed".into();
    assert_eq!(edited.page_header_hash(1).unwrap(), None);
}
#[test]
fn invalid_cached_headers_are_contextual_and_digests_are_immutable() {
    let values = collection(1);
    values.cache_page_header_hash(0, "a".repeat(64)).unwrap();
    values.cache_page_header_hash(0, "a".repeat(64)).unwrap();
    assert!(values.cache_page_header_hash(0, "b".repeat(64)).is_err());
    assert!(values.cache_page_header_hash(0, "bad".into()).is_err());
    assert!(values.cache_page_header_hash(1, "a".repeat(64)).is_err());
    assert!(values.page_header_hash(1).is_err());
    let cache = PageCache::<Item>::default();
    let refs = [PageReference {
        values: "a".repeat(64),
        headers: "b".repeat(64),
    }];
    for headers in [
        vec![],
        vec![Item::new(0).header(); 129],
        vec![Item::new(0).header(); 2],
    ] {
        assert!(
            PersistentCollection::from_page_refs(
                &refs,
                |_| Ok(headers.clone()),
                Arc::new(|_| unreachable!()),
                &cache
            )
            .is_err()
        );
    }
    let error = PersistentCollection::from_page_refs(
        &refs,
        |_| Err(beam_editor_domain::EditorError::Invalid("missing".into())),
        Arc::new(|_| unreachable!()),
        &cache,
    )
    .unwrap_err();
    assert!(error.to_string().contains(&"b".repeat(64)));
}
