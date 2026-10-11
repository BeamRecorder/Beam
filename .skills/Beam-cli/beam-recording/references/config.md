# Native capture configurations

The native Rust types are `packages/capture/src/model/config.rs` and `packages/capture/src/screenshot/mod.rs` in the Beam repository. Check the installed version's capabilities before using a platform source or optional capture feature.

## Screen selection

Windows/macOS discovered sources use:

```json
{"mode":"source","sourceId":"SOURCE_ID_FROM_DISCOVERY"}
```

On Linux, portal selection uses:

```json
{"mode":"portal","kind":"monitor","restoreToken":null}
```

Portal `kind` is `monitor`, `window` or `monitor-or-window`. A portal can require an interactive source/consent picker; discovery is not permission to bypass it. Region capture requires a display/monitor selection, not a window.

## Recording config

Replace the source and project UUID with real values. Choose an output root appropriate to the user's project; the example's relative root is `recordings`:

```json
{
  "projectId": "019a6000-0000-7000-8000-000000000001",
  "screen": {"mode":"portal","kind":"monitor","restoreToken":null},
  "systemAudio": null,
  "cursor": {"mode":"disabled"},
  "recording": {
    "outputRoot": "recordings",
    "videoBitrateBps": 12000000,
    "targetFps": 30,
    "keyframeIntervalSeconds": 2,
    "queueCapacity": 8,
    "minimumFreeBytes": 536870912
  },
  "failurePolicy": "fail-fast",
  "region": null
}
```

This example deliberately requests no audio or interaction tracking. System audio, when supported and requested, uses `{"mode":"default-output"}`. Cursor mode is `disabled`, `embedded` or `separate`; separate mode includes `captureClicks`, `captureShortcuts` and `captureShape`. Interaction capture can require additional platform permissions. Do not enable it merely because it is the native default.

`failurePolicy` may also be `continue-without-optional-tracks`, but choose that only if continuing without an optional track is acceptable to the user. A requested source/track failure must remain visible.

## Raw screenshot config

```json
{
  "screen": {"mode":"portal","kind":"monitor","restoreToken":null},
  "region": null
}
```

`beam-cli screenshot CONFIG.json OUTPUT.png` supplies the staged native `output` path itself. Do not add recording-only fields to construct a screenshot config.

Optional `region` is normalized display-relative `{x,y,width,height}`, with nonnegative origin, positive size and right/bottom within 1. It is not a pixel rectangle. `excludedWindowHandles` accepts actual platform handles when needed; do not fabricate handles or assume cross-platform support.
