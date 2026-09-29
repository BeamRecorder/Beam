import type { EditorApi } from '../shared/editorApi';
import type { SourceVisualEntry, VisualLease, VisualRequest, VisualState } from './visualTypes';

/** One native lease for the union of subscribers, including library and timeline clips. */
export function createSourceVisuals(api: EditorApi) {
  const entries = new Map<string, SourceVisualEntry>();
  const early = new Map<string, VisualLease>();
  let disposed = false;
  const release = (key: string) => void api.releaseVisual(key).catch(console.error);
  const unsubscribe = api.onVisual(value => {
    if (disposed) return;
    const entry = [...entries.values()].find(entry => entry.lease?.key === value.key);
    if (!entry) {
      if (early.size >= 128) early.delete(early.keys().next().value!);
      early.set(value.key, value); return;
    }
    if (entry.lease?.canvasId !== value.canvasId) return;
    entry.lease = value; entry.state = value;
    for (const listener of entry.listeners) listener(value);
  });
  function load(key: string, current: SourceVisualEntry, pending: Promise<VisualLease>) {
    void pending.then(value => {
      if (disposed || entries.get(key) !== current || !current.listeners.size) { release(value.key); return; }
      const buffered = early.get(value.key);
      const state = buffered?.canvasId === value.canvasId ? buffered : value; early.delete(value.key);
      current.lease = state; current.state = state;
      for (const listener of current.listeners) listener(state);
    }).catch(cause => {
      if (entries.get(key) !== current || disposed) return;
      current.state = { status: 'failed', error: String(cause) };
      for (const listener of current.listeners) listener(current.state);
    });
  }
  function retryFailed() {
    for (const [key, entry] of entries) {
      if (entry.state.status !== 'failed') continue;
      const lease = entry.lease; entry.lease = undefined;
      entry.state = { status: 'loading', error: null };
      for (const listener of entry.listeners) listener(entry.state);
      load(key, entry, (lease ? api.releaseVisual(lease.key) : Promise.resolve()).then(() => {
        if (disposed || entries.get(key) !== entry || !entry.listeners.size) throw new Error('preview subscription ended');
        return entry.acquire();
      }));
    }
  }
  function subscribe(projectId: string, assetId: string, request: VisualRequest, listener: (state: VisualState) => void) {
    if (disposed) return () => {};
    const key = JSON.stringify([projectId, assetId, request]);
    let entry = entries.get(key);
    if (!entry) {
      entry = { listeners: new Set(), state: { status: 'loading', error: null }, acquire: () => api.acquireVisual(projectId, assetId, request) };
      entries.set(key, entry); load(key, entry, entry.acquire());
    }
    entry.listeners.add(listener); listener(entry.state);
    const current = entry;
    return () => {
      current.listeners.delete(listener);
      if (!current.listeners.size && entries.get(key) === current) {
        entries.delete(key); if (current.lease) release(current.lease.key);
      }
    };
  }
  return { subscribe, retryFailed, dispose: () => {
    if (disposed) return; disposed = true; unsubscribe();
    for (const entry of entries.values()) if (entry.lease) release(entry.lease.key);
    entries.clear(); early.clear();
  } };
}
