# Shortcuts UI Handoff

## Infrastructure already available

Global preferences live in `Videos/DemoRecorder/preferencesSettings.json`. Shortcut values are stored under `shortcuts`:

```json
"hud.startStopRecording": {
  "keys": "Alt+Shift+R",
  "scope": "global",
  "category": "hud"
}
```

- `scope: "global"` is registered by Electron `globalShortcut` and emits the action id through `capture.onPreferenceShortcut`.
- `scope: "application"` is intentionally not registered globally. The renderer handles it only while DemoRecorder is focused.
- Existing APIs: `capture.getPreferences()`, `capture.updatePreferences(patch)`, `capture.resetPreferences(keys?)`, and `capture.onPreferencesChanged(listener)`.

## Adding a command

1. Add its default object in `electron/preferences/preferences-store.cjs` using a stable id (`hud.*`, `editor.*`, etc.).
2. For a global command, subscribe once in the relevant renderer to `capture.onPreferenceShortcut` and dispatch by id. Do not start a second `globalShortcut` registration in Vue.
3. For an application command, add a focused-window key handler. Ignore `input`, `textarea`, `select`, and `[contenteditable]`.
4. Persist a new binding with `capture.updatePreferences({ shortcuts: { [id]: next } })`.

## UI requirements

- Group rows by `category`; show the current `keys` value and scope.
- Capture the next keyboard chord, format it as an Electron accelerator (`Ctrl+F`, `CommandOrControl+Shift+R`), then submit the patch.
- Reject blank bindings and show a conflict error when another command uses the same global accelerator. The main process remains the final validator.
- Offer reset per command by patching the command default; do not reset unrelated preferences.
- When `onPreferencesChanged` fires, replace the displayed values so another window’s change is visible immediately.

## Tests

- Capture/format modifier chords on Windows and macOS naming.
- Duplicate global shortcut is rejected; identical application shortcuts may coexist only if their contexts cannot overlap.
- Shortcut handlers never run while typing.
- Global event dispatch reaches the HUD action exactly once.
