use super::types::*;
use argui_render::{GpuCanvasMailbox, GpuCanvasRegistration};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
fn entry(refs: usize, touched: u64, status: Status) -> Entry {
    let mailbox = GpuCanvasMailbox::new();
    let registration = GpuCanvasRegistration::new(
        "test.waveform",
        super::waveform::Factory {
            mailbox: mailbox.clone(),
            pipelines: Default::default(),
        },
    );
    Entry {
        registration,
        target: Target::Audio(mailbox),
        cancel: Arc::new(AtomicBool::new(false)),
        refs,
        touched,
        last: None,
        status,
        error: None,
    }
}
#[test]
fn final_lease_cancels_pending_but_retains_completed_previews() {
    let mut cache = Cache::default();
    cache
        .entries
        .insert("a".into(), entry(2, 1, Status::Loading));
    let cancel = cache.entries["a"].cancel.clone();
    cache.release("a");
    assert!(!cancel.load(Ordering::Acquire));
    cache.release("a");
    assert!(cancel.load(Ordering::Acquire));
    cache.release("a");
    assert_eq!(cache.entries["a"].refs, 0);
    cache.release("missing");
    cache.entries.insert("b".into(), entry(1, 2, Status::Ready));
    let cancel = cache.entries["b"].cancel.clone();
    cache.release("b");
    assert!(!cancel.load(Ordering::Acquire));
    cache.entries.clear();
    assert!(cancel.load(Ordering::Acquire));
}
#[test]
fn cache_evicts_least_recent_inactive_and_never_evicts_live_canvases() {
    let mut cache = Cache::default();
    cache.make_room().unwrap();
    for index in 0..128 {
        cache
            .entries
            .insert(index.to_string(), entry(1, index, Status::Ready));
    }
    assert!(cache.make_room().is_err());
    cache.entries.get_mut("7").unwrap().refs = 0;
    cache.entries.get_mut("70").unwrap().refs = 0;
    cache.make_room().unwrap();
    assert!(!cache.entries.contains_key("7"));
    assert!(cache.entries.contains_key("70"));
}
#[test]
fn narrow_visual_envelopes_reject_paths_and_unknown_media_properties() {
    for payload in [
        serde_json::json!({"projectId":"p","assetId":"a","request":{"kind":"video","positionMs":-1}}),
        serde_json::json!({"projectId":"p","assetId":"a","request":{"kind":"audio","startMs":0,"endMs":10,"stepMs":1,"path":"/tmp"}}),
        serde_json::json!({"projectId":"p","assetId":"a","request":{"kind":"video","positionMs":0},"path":"/tmp"}),
    ] {
        assert!(serde_json::from_value::<Acquire>(payload).is_err());
    }
    let request: Acquire = serde_json::from_value(serde_json::json!({"projectId":"p","assetId":"a","request":{"kind":"video","positionMs":0}})).unwrap();
    assert_eq!(request.project_id, "p");
}
