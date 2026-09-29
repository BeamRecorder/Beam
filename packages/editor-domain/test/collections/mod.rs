use beam_editor_domain::collections::*;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use uuid::Uuid;
mod access;
mod cached;
mod changes;
mod headers;
mod identities;
mod memo;
mod mutations;
mod scale;
mod serialization;
mod track_types;
mod transaction_scale;
mod types;
use types::{Header, Item};

fn collection(count: usize) -> PersistentCollection<Item> {
    (0..count).map(Item::new).collect::<Vec<_>>().into()
}
fn lazy(count: usize, loads: Arc<AtomicUsize>) -> PersistentCollection<Item> {
    let items = collection(count);
    let pages = (0..items.page_count())
        .map(|index| LazyPage {
            hash: format!("{index:064x}"),
            headers: items
                .page_headers(index)
                .unwrap()
                .iter()
                .map(|header| (**header).clone())
                .collect(),
        })
        .collect();
    PersistentCollection::from_lazy(
        pages,
        Arc::new(move |hash| {
            loads.fetch_add(1, Ordering::SeqCst);
            items.try_page_values(usize::from_str_radix(hash, 16).unwrap())
        }),
    )
    .unwrap()
}
#[test]
fn clones_share_pages_and_index_and_debug_does_not_load_payloads() {
    let loads = Arc::new(AtomicUsize::new(0));
    let values = lazy(300, loads.clone());
    let history = values.clone();
    assert_eq!(values.shared_pages(&history), 3);
    assert!(values.shares_index(&history));
    assert_eq!(values.len(), 300);
    assert!(!values.is_empty());
    assert_eq!(values.headers().count(), 300);
    assert!(format!("{values:?}").contains("loaded_pages: 0"));
    assert_eq!(loads.load(Ordering::SeqCst), 0);
    let empty = PersistentCollection::<Item>::new();
    assert!(empty.is_empty());
    assert_eq!(empty.page_count(), 0);
}
#[test]
fn immutable_hash_cache_and_metadata_bounds_are_checked() {
    let values = collection(1);
    assert_eq!(values.page_hash(0).unwrap(), None);
    let hash = "a".repeat(64);
    values.cache_page_hash(0, hash.clone()).unwrap();
    values.cache_page_hash(0, hash.clone()).unwrap();
    assert_eq!(values.page_hash(0).unwrap(), Some(hash.as_str()));
    for hash in ["b".repeat(64), "A".repeat(64), "../escape".into()] {
        assert!(values.cache_page_hash(0, hash).is_err());
    }
    assert!(values.page_hash(1).is_err());
    assert!(values.cache_page_hash(1, "a".repeat(64)).is_err());
    assert!(values.page_headers(1).is_err());
}
#[test]
fn lazy_construction_checks_page_sizes_and_unique_ids() {
    for headers in [
        vec![],
        vec![Item::new(1).header(); 129],
        vec![Item::new(1).header(); 2],
        vec![Header {
            id: Uuid::nil(),
            label: "invalid".into(),
        }],
    ] {
        assert!(
            PersistentCollection::<Item>::from_lazy(
                vec![LazyPage {
                    hash: "a".repeat(64),
                    headers
                }],
                Arc::new(|_| unreachable!())
            )
            .is_err()
        );
    }
    assert!(
        PersistentCollection::<Item>::from_lazy(
            vec![LazyPage {
                hash: "invalid".into(),
                headers: vec![Item::new(1).header()]
            }],
            Arc::new(|_| unreachable!())
        )
        .is_err()
    );
    let invalid: PersistentCollection<_> = vec![Item::new(1), Item::new(1)].into();
    assert!(invalid.validate_index().is_err());
    assert!(invalid.try_by_id(Item::new(1).id).is_err());
    let mut nil = Item::new(1);
    nil.id = Uuid::nil();
    assert!(
        PersistentCollection::from(vec![nil])
            .validate_index()
            .is_err()
    );
}
