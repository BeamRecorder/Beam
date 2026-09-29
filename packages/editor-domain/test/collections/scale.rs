use super::*;
use beam_editor_domain::{
    Clip, Effects,
    animation::{Binding, Value},
};
use std::{
    alloc::{GlobalAlloc, Layout, System},
    time::Instant,
};
static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
struct CountedAllocator;
unsafe impl GlobalAlloc for CountedAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc(layout) };
        if !pointer.is_null() {
            let live = LIVE.fetch_add(layout.size(), Ordering::Relaxed) + layout.size();
            PEAK.fetch_max(live, Ordering::Relaxed);
        }
        pointer
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        LIVE.fetch_sub(layout.size(), Ordering::Relaxed);
        unsafe { System.dealloc(pointer, layout) }
    }
}
#[global_allocator]
static ALLOCATOR: CountedAllocator = CountedAllocator;
pub(super) fn heap_bytes() -> usize {
    LIVE.load(Ordering::Relaxed)
}
pub(super) fn decisions(
    catalog: &[beam_editor_domain::effects::Definition],
) -> PersistentCollection<Clip> {
    let template = beam_editor_domain::effects::definition(catalog, "beam.color", 1)
        .unwrap()
        .instantiate();
    template.validate(catalog).unwrap();
    (0..10_000)
        .map(|index| Clip {
            id: Uuid::from_u128(index + 1),
            asset_id: Uuid::from_u128(11_000),
            track_id: Uuid::from_u128(11_001),
            start_ms: index as u64 * 1000,
            source_in_ms: 0,
            duration_ms: 1000,
            effects: Effects::default(),
            cursor_style: None,
            instances: (0..100)
                .map(|_| {
                    let mut instance = template.clone();
                    instance.id = Uuid::new_v4();
                    instance
                })
                .collect(),
            rate: Default::default(),
            animation_offset_ms: 0,
            generator: None,
            link_group: None,
            title: None,
        })
        .collect::<Vec<_>>()
        .into()
}
#[test]
fn ten_thousand_clips_with_one_hundred_fx_share_fifty_histories() {
    let started = Instant::now();
    let baseline = LIVE.load(Ordering::Relaxed);
    let catalog = beam_editor_domain::effects::catalog::builtins();
    let mut values = decisions(&catalog);
    let build_ms = started.elapsed().as_secs_f64() * 1000.;
    let before = LIVE.load(Ordering::Relaxed);
    let mutation = Instant::now();
    let mut histories = Vec::with_capacity(50);
    for index in 0..50 {
        histories.push(values.clone());
        let mut clip = values
            .try_by_id_mut(Uuid::from_u128(index + 1))
            .unwrap()
            .unwrap();
        clip.instances[0].parameters.insert(
            "brightness".into(),
            Binding::Constant {
                value: Value::Number((index + 1) as f64 / 100.),
            },
        );
    }
    let history_bytes = LIVE.load(Ordering::Relaxed) - before;
    let edit_ms = mutation.elapsed().as_secs_f64() * 1000.;
    assert_eq!(values.shared_pages(&histories[49]), values.page_count() - 1);
    assert!(histories.iter().all(|history| values.shares_index(history)));
    assert!(
        histories
            .iter()
            .all(|history| values.shares_identities(history))
    );
    values.validate_identities().unwrap();
    assert!(
        history_bytes < 16 * 1024 * 1024,
        "history allocated {history_bytes} bytes"
    );
    let untouched = Uuid::from_u128(9999);
    assert!(Arc::ptr_eq(
        &values.try_by_id(untouched).unwrap().unwrap(),
        &histories[0].try_by_id(untouched).unwrap().unwrap()
    ));
    let query = Instant::now();
    let headers = values.headers().take(128).collect::<Vec<_>>();
    assert_eq!(headers.len(), 128);
    let query_us = query.elapsed().as_secs_f64() * 1e6;
    let mut report = serde_json::json!({"clips":10000,"instancesPerClip":100,"histories":50,"pages":values.page_count(),"buildMs":build_ms,"fiftyEditsMs":edit_ms,"headerQueryUs":query_us,
        "decisionBytes":before-baseline,"historyAdditionalBytes":history_bytes,"peakBytes":PEAK.load(Ordering::Relaxed),"sharedIndex":true,"untouchedClipPointerEqual":true});
    std::fs::write(
        "/tmp/beam-collection-scale.json",
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    drop(headers);
    let folder = std::env::var_os("BEAM_SCALE_TEMP_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let root = tempfile::Builder::new()
        .prefix(".beam-scale-")
        .tempdir_in(folder)
        .unwrap();
    let store = Instant::now();
    let mut references =
        vec![beam_editor_domain::project::collection_blocks::store(root.path(), &values).unwrap()];
    for history in &histories {
        references.push(
            beam_editor_domain::project::collection_blocks::store(root.path(), history).unwrap(),
        );
    }
    let store_ms = store.elapsed().as_secs_f64() * 1000.;
    let persisted_bytes: u64 = std::fs::read_dir(root.path().join(".editor/blocks"))
        .unwrap()
        .map(|entry| entry.unwrap().metadata().unwrap().len())
        .sum();
    drop(values);
    drop(histories);
    let unloaded_baseline = LIVE.load(Ordering::Relaxed);
    let open = Instant::now();
    let cache = PageCache::<Clip>::default();
    let loaded: Vec<_> = references
        .iter()
        .map(|reference| {
            beam_editor_domain::project::collection_blocks::load(root.path(), reference, &cache)
                .unwrap()
        })
        .collect();
    let open_ms = open.elapsed().as_secs_f64() * 1000.;
    let metadata_bytes = LIVE.load(Ordering::Relaxed) - unloaded_baseline;
    assert!(loaded.iter().all(|state| state.loaded_pages() == 0));
    assert!(
        loaded
            .iter()
            .all(|state| loaded[0].shares_index(state) && loaded[0].shares_identities(state))
    );
    assert!(
        metadata_bytes < (before - baseline) / 2,
        "lazy metadata retained {metadata_bytes} bytes"
    );
    let payload_before = LIVE.load(Ordering::Relaxed);
    let query = Instant::now();
    let visible = loaded[0].try_page(0, 128).unwrap();
    let payload_query_ms = query.elapsed().as_secs_f64() * 1000.;
    let payload_bytes = LIVE.load(Ordering::Relaxed) - payload_before;
    assert_eq!(visible.len(), 128);
    assert_eq!(loaded[0].loaded_pages(), 1);
    assert!(loaded[1..].iter().all(|state| state.loaded_pages() == 0));
    for clip in &visible {
        for instance in &clip.instances {
            instance.validate(&catalog).unwrap();
        }
    }
    beam_editor_domain::project::collection_blocks::store(root.path(), &loaded[0]).unwrap();
    assert_eq!(loaded[0].loaded_pages(), 1);
    report["persistence"] = serde_json::json!({"states":51,"storeMs":store_ms,"blockBytes":persisted_bytes,
        "openMs":open_ms,"metadataHeapBytes":metadata_bytes,"unloadedFxPagesAtOpen":true,
        "sharedHistoryIndexes":true,"firstPageQueryMs":payload_query_ms,"firstPageHeapBytes":payload_bytes,
        "loadedPagesAfterQueryAndUnchangedCheckpoint":1});
    std::fs::write(
        "/tmp/beam-collection-scale.json",
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    println!("{report}");
}
