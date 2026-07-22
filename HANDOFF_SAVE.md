# Editor Save Feedback Handoff

## Current save contract

`useProjectEditorState` owns autosave for composition, zooms, imported backgrounds and editor presentation settings.

- Changes are coalesced for 250 ms.
- Writes are serialized, so a later edit cannot be overwritten by an earlier IPC response.
- `saveNow()` flushes the debounce timer and returns the current write promise.
- A failed write is logged and does not permanently block later writes.

## Recommended state API addition

Expose these readonly refs from `useProjectEditorState`:

```ts
status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
lastSavedAt: Date | null
error: Error | null
```

Set `pending` as soon as a watched edit is detected, `saving` when IPC starts, `saved` on success, and `error` on failure. Keep the error until a later successful save or an explicit dismiss. Do not block editing while saving.

## UI behavior

- Put a compact indicator in the editor top bar: `Saving…`, then `Saved`, and an actionable `Save failed — Retry` state.
- Use a subtle 150–250 ms fade for the saved confirmation; do not show a spinner for the 250 ms debounce window unless another write is already running.
- Before changing project, closing the editor, exporting, or quitting, call `await saveNow()`; if it fails, offer retry/cancel rather than silently leaving.
- Background imports and destructive clip operations should call `saveNow()` immediately after their local mutation, rather than waiting for the debounce.

## Tests

- Multiple edits during a slider drag produce one IPC write.
- A write in flight followed by another change saves both snapshots in order.
- Error transitions to retryable state and a later successful write clears it.
- Navigation/export waits for the final flush.
