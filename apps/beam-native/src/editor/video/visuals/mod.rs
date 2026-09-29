//! Leased source visuals: shared by source time, cancelled offscreen, never serialized as pixels.
mod pipelines;
mod pool;
mod types;
mod waveform;
use argui_render::GpuCanvasRegistration;
use beam_editor_engine::{EditorController, video::visuals::types::Update};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use types::{Acquire, Cache, Entry, Release, Status};

pub(crate) fn register(
    registry: &Arc<crate::ServiceRegistry>,
    controller: Arc<EditorController>,
) -> Vec<GpuCanvasRegistration> {
    let cache = Arc::new(Mutex::new(Cache::default()));
    let pool = Arc::new(pool::Pool::new());
    let registrations = pool.registrations();
    let released = Arc::clone(&cache);
    registry.register("editor", "releaseVisual", move |payload| {
        super::super::result((|| {
            let request: Release = crate::json::decode(payload)?;
            released
                .lock()
                .map_err(|_| "source cache unavailable")?
                .release(&request.key);
            Ok(())
        })())
    });
    let events = Arc::downgrade(registry);
    registry.register("editor", "acquireVisual", move |payload| {
        super::super::result((|| {
            let request: Acquire = crate::json::decode(payload)?;
            let source = controller
                .source(request.asset_id.clone())
                .map_err(|e| e.to_string())?;
            if source.project_id.to_string() != request.project_id {
                return Err("source project changed".into());
            }
            beam_editor_engine::video::visuals::validate(&source, &request.request)
                .map_err(|e| e.to_string())?;
            let key = format!(
                "{}:{}:{}",
                request.project_id,
                request.asset_id,
                crate::json::encode(&request.request)?
            );
            let mut entries = cache.lock().map_err(|_| "source cache unavailable")?;
            entries.clock = entries.clock.wrapping_add(1);
            let clock = entries.clock;
            if let Some(entry) = entries.entries.get_mut(&key) {
                entry.refs += 1;
                entry.touched = clock;
                if entry.status == Status::Ready || !entry.cancel.load(Ordering::Acquire) {
                    if let Some(last) = &entry.last {
                        entry.target.publish(last);
                    }
                    return Ok(entry.reply(&key));
                }
            }
            // A cancelled partial slice starts again; completed slices remain reusable.
            entries.entries.remove(&key);
            entries.make_room()?;
            let lease = pool.acquire(&request.request)?;
            let target = lease.target();
            let registration = lease.registration();
            let cancel = Arc::new(AtomicBool::new(false));
            entries.entries.insert(
                key.clone(),
                Entry {
                    _lease: Some(lease),
                    registration,
                    target,
                    cancel: Arc::clone(&cancel),
                    refs: 1,
                    touched: clock,
                    last: None,
                    status: Status::Loading,
                    error: None,
                },
            );
            let weak = Arc::downgrade(&cache);
            let callback_key = key.clone();
            let callback_cancel = Arc::clone(&cancel);
            let events = events.clone();
            let submitted = controller.source_visual(
                source,
                request.request,
                cancel,
                Box::new(move |update| {
                    let Some(cache) = weak.upgrade() else {
                        return;
                    };
                    let reply = {
                        let mut cache = cache.lock().unwrap_or_else(|p| p.into_inner());
                        let Some(entry) = cache.entries.get_mut(&callback_key) else {
                            return;
                        };
                        if !Arc::ptr_eq(&entry.cancel, &callback_cancel)
                            || callback_cancel.load(Ordering::Acquire)
                        {
                            return;
                        }
                        match update {
                            Ok(Update { visual, complete }) => {
                                entry.target.publish(&visual);
                                entry.last = Some(visual);
                                entry.status = if complete {
                                    Status::Ready
                                } else {
                                    Status::Loading
                                };
                            }
                            Err(error) => {
                                entry.status = Status::Failed;
                                entry.error = Some(error.to_string());
                            }
                        }
                        entry.reply(&callback_key)
                    };
                    if let Some(registry) = events.upgrade() {
                        registry.broadcast_event(
                            &serde_json::json!({"type":"sourceVisual", "visual":reply}),
                        );
                    }
                }),
            );
            if let Err(error) = submitted {
                entries.entries.remove(&key);
                return Err(error.to_string());
            }
            Ok(entries.entries[&key].reply(&key))
        })())
    });
    registrations
}
