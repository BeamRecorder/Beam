# Electron windows: behavior and constraints

This application uses transparent, frameless Electron windows as part of the UI. Window bounds are therefore product behavior, not merely layout details. Read this document before changing Electron windows, renderer window sizing, popovers, or mouse interaction.

## Window modes

The transparent main window is controlled by `electron/window/window-controller.cjs` and owns the HUD and Recorder modes. The editor uses a separate opaque window created by `electron/window/editor-window.cjs`; this separation is required for native window animations and Windows Snap Layouts.

| Mode       | Bounds / behavior                                                                                                                                                                                                                                                                                                                                                                              | Interaction                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hud`      | Fixed at `352 × 512`: a `320 × 480` HUD card plus 16 px of room on every edge for its border and shadow. The canonical dimensions live in `preferences.json` as `hudWindow`; startup normalization restores them when missing or unexpected. It returns to its prior HUD position after Recorder mode. Dragging is bounded by the physical display bounds, not the taskbar-excluded work area. | macOS/Windows: transparent pixels pass through; renderer enables mouse handling only over interactive HUD elements. Linux: the window stays fully interactive, so the transparent margin also captures clicks (accepted trade-off). |
| `recorder` | `72 × 344`, positioned at the right-middle of the active display. It is draggable and remembers a position per display in preferences.                                                                                                                                                                                                                                                         | Always on top, fixed size, content protected. Drag starts only on mousedown, never on hover.                                                                                                                                        |
| `editor`   | Independent opaque windows starting at `1280 × 800`, with a native minimum of `960 × 600`.                                                                                                                                                                                                                                                                                                     | `titleBarStyle: hidden` keeps the custom Beam content while Window Controls Overlay supplies the native system buttons. The empty titlebar area uses `app-region: drag`; Beam actions stay in `no-drag` regions.                    |

Use `window:show-hud` / `capture.showHud()` to return from the editor. Do not reproduce it by separately changing mode, maximize state, size, and position: ordering matters.

While the editor opens, keep the transparent HUD window visible and replace only its card contents. Loading progress is phase-based and comes from validated editor lifecycle events (`BrowserWindow` creation, renderer load, project load, timeline load, and first paint); do not replace it with timer-driven progress. After `editor:ready`, demote and hide the native HUD window before showing and focusing the editor window. Verify the HUD is no longer natively visible; if that postcondition fails, do not present the editor above a live HUD. Returning to the HUD restores its normal always-on-top policy.

Disable background throttling while the editor initializes behind its native presentation gate. Main-frame navigation failure, renderer loss, unresponsiveness, or a 30-second startup deadline must reject the open request and dispose only that pending editor window. Keep the requesting controls usable for retry. Bind callbacks to the created window so a late event from a failed attempt cannot close its replacement or quit the HUD.

Commit the HUD's hidden policy before calling native demotion or hide operations. Native focus/blur callbacks must not raise it again during editor presentation. Apply topmost changes only when the policy changes, recording that policy before the native call to prevent reentrant focus events. Automatic editor DevTools follow the same `BEAM_DEVTOOLS=1` opt-in as the HUD and must not activate during loading.

The developer-only recorder launcher is the deliberate coexistence exception. Settings in an editor may reveal the existing HUD window as a real recorder configuration surface without closing the source editor. The HUD must carry the source editor's native media ID, remain the sole owner of recording and sidecar state, and return focus to that editor when dismissed. Once recording completes, the resulting debug project opens in a new independent editor window; never model that window as a native child of the source editor.

Each editor window owns its project context and renderer-ready lifecycle. IPC handlers must resolve the editor session from the sending `webContents`; global project or ready state is not valid when multiple editors coexist. Closing or returning from one editor must not destroy another live editor.

Native window titles identify their role in the operating-system switcher: the HUD/recording page is `Beam Recorder`, while each editor renderer sets its own title to `{project name} - Beam Editor` after loading the project. Keep this renderer-local so concurrent editor windows cannot overwrite one another.

## Shadows and content size

Electron clips painting outside the BrowserWindow. A CSS shadow around an element that touches the renderer viewport is therefore visibly cut off and looks like a rectangular dark block.

- Keep the HUD card at `320 × 480` pixels, with a `352 × 512` BrowserWindow and a 16 px inset.
- When HUD content changes height or width, include the 32 px outer allowance in the Electron `setSize` request.
- Do not solve a clipped shadow by increasing the shadow token. Prefer reserving physical renderer space first.
- The countdown uses a centered `560 × 256` transparent window: its `160 × 160` circle and shortcut-hint row keep at least 16 px of outer room so the border and shadow remain intact.
- The main HUD header keeps the Beam logo, flexible capture-mode group and window controls in no-drag regions. The countdown entry `countdown.html` loads only its overlay, theme and translations for shortcut hints.

## Mouse pass-through and focus stealing

Transparent pixels in an Electron window still intercept input unless `setIgnoreMouseEvents` is used.

- HUD: `App.vue` detects an interactive element under the pointer and calls `capture.setInteractive`. On macOS and Windows, do not make the whole transparent HUD window interactive; only interactive elements handle mouse events. On Linux, Electron does not implement the `{ forward: true }` mousemove forwarding option (macOS/Windows only), so a click-through HUD could never classify the pointer and would stay permanently click-through. Linux therefore keeps the HUD window fully interactive; the 16 px transparent margin then also captures clicks, which is the accepted Linux trade-off. `capture.setInteractive` is inert there. Do not use `setShape()` to restore margin pass-through: on Linux the window shape clips drawing as well as input, cutting off popovers and overlay content near the window edges.
- Camera overlay: starts in pass-through mode. `CameraOverlayApp.vue` enables interaction only for the camera, controls, and open popover.
- Camera overlay: opens at `220 × 220` with the video cropped to fill its square window. An exact saved `320 × 180` default adopts the new size while keeping its lower-right anchor where global coordinates are available; custom resized dimensions remain saved.
- Wayland intentionally reports global window coordinates as `(0, 0)`, so absolute overlay placement cannot be persisted or restored there. Do not force XWayland globally: incompatible GPU/X11 stacks can prevent the HUD from rendering. The camera window is opaque and keeps its compositor shadow on Linux because Electron does not reliably expose native resize edges for fully transparent/decoration-free windows there.
- Recorder: only the visible grip is a native draggable region. Leave its ancestor containers unmarked and apply `no-drag` to controls individually; a containing `no-drag` rectangle can subtract the grip from native hit testing.
- Editor: use the native draggable titlebar region. Do not reintroduce renderer mousemove/IPC window dragging; it bypasses native edge snapping and window transitions.
- Editor: keep `transparent: false`, `thickFrame: true`, and the native Window Controls Overlay. An HTML maximize button does not expose Windows 11 Snap Layouts.
- Editor: configure Window Controls Overlay with a fixed transparent color and neutral symbol color at construction; omitting `color` lets Windows paint its light system color over a dark editor. Transparent WCO requires Electron 43.2 or newer because Electron 43.1.1 incorrectly fell back to the default frame color for fully transparent values. A live editor theme change is renderer-only: do not update `nativeTheme`, the BrowserWindow background, or `setTitleBarOverlay()` while the window is visible. Use the selected theme only as the next window's initial fallback background.
- Countdown: uses its own non-focusable, click-through window. It must never steal focus from the recording target.

## Popovers in transparent windows

Teleporting a popover to `body` does not let it escape its BrowserWindow. It can still be clipped by the native window bounds.

- Generic popovers clamp to their renderer viewport, switch up/down where possible, and limit height with scrolling.
- Screenshot Composition is a renderer panel bounded by the canvas workspace, excluding the sidebar and native titlebar. Its header uses pointer capture after a drag threshold, previews with `translate3d`, and commits only its normalized user preference on release. Keep the entire open panel inside the workspace without changing its opening direction or height during dragging. Recalculate direction for a collapsed header and lock it at opening; keep the header anchored. Account for editor UI scaling and cancel gestures on Escape, capture loss, focus loss or workspace resize. This must not move or resize the native editor window.
- Keep the Recorder native window fixed at `72 × 344`, including during hover and drag. Labels use the controls' accessible names and native `title` hints; never resize or reposition the native window to make renderer tooltips overflow because that makes the bar jump under the pointer.
- The camera popover temporarily expands its native window. Before expansion, store the window bounds; after expansion, offset the rendered camera preview by the inverse native-window displacement. On close, restore both the original bounds and a zero preview offset. Without that compensation, opening the popover visibly moves the camera preview.
- Nested teleported popovers must be registered as descendants using `data-popover-owner`; otherwise selecting an inner `Select` is treated as an outside click and closes its parent.

## UI scaling and browser zoom

- `appearance.uiScale` is an editor-only product setting. Do not expose or apply it in the HUD.
- Chromium page zoom is not a product setting. Keep `webPreferences.zoomFactor` at 1, reset persisted page zoom before presenting HUD/editor windows, and block Ctrl/Cmd plus wheel or browser zoom keys. Timeline and canvas zoom handlers may still consume wheel input for their own scoped behavior.
- Keep `hudWindow.width` and `hudWindow.height` at the canonical `352 × 512` values. Preferences normalization must replace missing, malformed, or unexpected values before the HUD window is created.

## Content protection and capture

Recorder mode enables Electron content protection. Camera and Recorder windows must remain separate from the native capture session logic; renderer-side windows are only presentation and sidecar controls. Do not broaden preload APIs beyond narrow, named IPC calls.

## HUD auxiliary window lifetime

The editor window manager prepares the countdown and teleprompter at HUD startup and whenever the user returns to the HUD. Preparation runs alongside HUD presentation; it must not block the HUD on renderer loading. Both auxiliary windows are released once the editor can be presented and the HUD is hidden. A canceled countdown (`show(null)`) must not recreate a released window.

Before releasing the teleprompter, hide it and request a checkpoint from its renderer. The renderer flushes pending document/preferences saves and returns its draft, matching session, reading line, scroll position and paused/editing state. Only the owning webContents can acknowledge the unique checkpoint request. A timeout or invalid checkpoint retains the renderer to preserve the draft; returning to the HUD during a pending checkpoint cancels disposal. Restore the matching state before announcing renderer readiness. Native loading and renderer readiness must both complete before showing a requested reader. Hidden readers do not autoscroll: use the native visibility notification as well as page visibility, because a preloaded `show: false` window can initially report `document.hidden === false`. Restore the saved scroll offset with instant scrolling so CSS smooth scrolling cannot move it while the renderer is being prepared.

Keep bounds persistence and existing visibility intent across suspension. Capture each native window instance in load/close callbacks so stale callbacks cannot destroy a replacement; failed loads must allow preparation to retry. The narrow preload methods are `getTeleprompterResumeState`, `onTeleprompterSuspend`, `acknowledgeTeleprompterSuspend` and `notifyTeleprompterReady`.

## Checklist for a window change

1. Read this document and `docs/ARCHITECTURE.md`.
2. Identify whether the change affects renderer layout, native bounds, input pass-through, or all three.
3. Preserve the relevant content-to-window margin for shadows.
4. Verify transparent regions do not steal clicks or focus.
5. Verify popovers at each screen edge and with nested selects.
6. Verify HUD → Recorder → Editor → HUD restores the intended bounds and position.
7. Verify Ctrl/Cmd plus wheel, `+`, `-`, and `0` cannot change HUD or editor browser zoom, while editor timeline/canvas zoom still works.
8. Run `bun run build` and the focused tests.

## Quick Snip selection and Crop Bar

Windows/macOS capture an adjustable screen region. Their Crop Bar is an owned child of the selection overlay. Set its native parent before showing it, including at construction. Linux captures a single window through the native Portal chooser (`portal:window`), opened during recording preparation. Show the Linux Crop Bar without a screen-region overlay or parent, and send `region: null`; screen coordinates cannot describe the chosen window. The Crop Bar remains available during recording because it is a separate window from the captured source.

Present the overlay after `ready-to-show`; present the Crop Bar after both native readiness and the `quick-snip:crop-ready` message from its mounted Vue component. `ready-to-show` alone does not mean an asynchronously imported component has subscribed to IPC. Deliver the latest configuration before any queued command, and discard a queued start when the window is hidden or canceled.

Detach the Crop Bar before hiding the selection overlay. Keep the child above the overlay when the parent is shown or focused, and remove parent listeners when detaching or destroying it. Keep the `480 × 132` native bounds with 10 px margins around the controls, and disable background throttling for the recorder hosted in this window. Configuration objects sent into capture IPC must contain plain values, never Vue reactive proxies.

The mode group reserves 240 px for two equal choices; overflowing labels use the shared Button marquee on hover, without widening the native window. Mode-specific controls transition with a short fade/translation and respect reduced motion. Keep the bar DOM stable when configuration changes so native focus and the transition survive.

The Crop Bar has two rows: the shared button group limited to two labelled Studio/Screenshot choices and the preset field, then mode-specific controls and capture actions. Both choices capture directly with their preset; video jobs use Instant storage and export without opening Studio. Export format comes from the preset. Right-click or Shift+F10 on a microphone, camera or system-audio control opens an Electron native radio menu owned by the Crop Bar. Only its renderer may request this bounded menu, and leaving selection closes it. Browser device discovery does not open a stream to obtain labels. System audio offers the default system output and Off, matching the native capture contract. Use native selects and translated native `title` hints so menus and hints are not clipped by the transparent surface. Clicking a field's icon or label focuses its select and opens its native picker; direct select clicks and keyboard operation retain native behavior. Hide audio, microphone, camera and zoom controls in Screenshot mode. OFF toggles use red crossed-out icons, separately from disabled controls. The controls container is `no-drag`; its full-height grip is a separate sibling so the interactive rectangle cannot subtract the drag handle.

Keep selection controls fully visible. During recording, honor the same `recordingBar.visibility` preference as Recorder: always visible, 15% opacity until hovered, or hidden until hovered. Hover and keyboard focus restore full opacity. Preserve the native window so it can receive hover and stop/cancel commands. Excluding the bar from video is separate from its desktop visibility: Windows uses Electron content protection (`WDA_EXCLUDEFROMCAPTURE` on supported Windows), and macOS explicitly excludes the Crop Bar's window ID in ScreenCaptureKit. `setContentProtection` alone does not exclude recent ScreenCaptureKit captures. These paths require visual recording checks on their target OS.

Canceling the native source picker returns the same Quick Snip job to selection. Restore the existing Crop Bar without repositioning it, reopening the picker or showing the HUD; retain mode, preset and devices. Only the owning Crop Bar may report this cancellation, and only the matching preparing job may handle it. A real failure keeps its details and copy action; the X inside the failed pill is also an enabled native-hit-testable dismiss button.

Linux system-audio preview subscriptions are shared by renderer identity in `capture/system-audio-preview.cjs`. A closing or disabled window releases only its subscription. The Rust engine stops the native preview for recording preparation; retain subscribers, invalidate the cached preview state, and let their next level poll resume the preview only when the engine is idle or terminal. Never start another preview during an active capture.

Use native draggable regions for the grip without a containing `no-drag` region. Track `move` on Linux as well as `moved` on Windows/macOS, ignoring both notifications for programmatic bounds changes. Wayland still controls initial placement and does not provide global coordinates for restoring a user position.

Persist the Crop Bar position by display ID under `extras.quickSnipBarPositions`. Restore and clamp it to that display's work area on reopening, then treat it as user-positioned so selection updates cannot overwrite it. Movement updates memory only; commit on Windows `moved`, or after 350 ms without movement on Linux/macOS (`moved` is an alias of `move` on macOS). Flush pending movement before hide/destroy. Programmatic placement and unchanged coordinates never write preferences. Preserve valid negative coordinates and zero origins on platforms that expose them; ignore Wayland's synthetic `(0, 0)`.

## Quick Snip status window

Quick Snip uses a fixed `380 × 184` transparent always-on-top status window. Its `356 × 76` pill sits 12 px inside the bottom edge when actions open above, or the top edge when they open below. On initial placement and committed movement, choose the side with more space in the display work area. Compensate the native Y origin by the 84 px reserved action space when changing side so the pill stays at the same screen coordinates. Clamp the full surface to the work area. Reveal actions with opacity and `translate3d`, preserving native bounds and pill position during hover. Progress updates must not call `setPosition`, `setSize`, `showInactive`, or `moveTop` repeatedly. Show only after renderer readiness, without focusing the window.

Persist the visible pill's X/Y (not the native window's origin) by display ID under `extras.quickSnipStatusPositions`, using the same movement commit policy as the Crop Bar. Restore its side from available space. Send `popoverSide` with the status snapshot, including the initial lookup, so renderer alignment matches native placement even if the component subscribes after window readiness. Movement suspends the completed-widget close timer until commit. Wayland's unavailable global coordinates also limit automatic screen-edge detection there.

Empty space inside the pill and its revealed details uses native draggable regions. Keep the thumbnail, status text, progress value, and action row in `no-drag` regions so hover and controls remain available. Hidden details and transparent outer margins are not drag handles. Place the window only on initial presentation; recalling an existing status window preserves its user-chosen position.

Bridge the gap between the pill and its actions with a transparent `no-drag` hit area overlapping both surfaces. Keep hover interaction active for 300 ms after mouse exit, canceling that delay on reentry, so crossing native drag regions cannot immediately close the panel or restore mouse pass-through. The completed file-copy action includes its translated label and icon.

Errors keep the details expanded and interactive even without hover. Keep the error row in `no-drag`, allow text selection, and use the shared `CopyButton` with native hints to copy the full message. Terminal dismissal remains enabled while another action is pending. The error row and action row must fit within the existing native margins.

A null render-task notification cancels the current export Worker while keeping the status window alive. Give each task its own AbortController and ignore initial task lookups superseded by newer notifications; canceling an export for editor handoff must not leave an encoder running behind the loading editor.

On Windows/macOS, use `setIgnoreMouseEvents` with forwarding and toggle interactivity only for the pill, its revealed controls, keyboard focus or a pending action. On Linux, keep the native surface interactive: forwarded mouse motion is unavailable, and Wayland does not guarantee the requested bottom-right position. Do not force an Ozone backend or use `setShape` to simulate pass-through.

Completion starts a five-second close timer, paused during interaction. This timer affects only the widget; file copies have no expiry and remain until the user replaces the clipboard. File clipboard publication belongs to `electron/clipboard/file-clipboard.cjs`, independently of status renderer lifetime. Errors remain visible. Timer disposal and renderer teardown must clean up export jobs. Capture the WebContents reference while the window is alive; reading `BrowserWindow.webContents` inside its destruction callback throws. Ignore readiness callbacks from closed or replaced windows, and discard their pending render tasks. Main-process Quick Snip actions must verify the status sender. When opening the editor, cancel unfinished export work while keeping the status requester alive to display any failure; close it only after successful presentation and only if it still owns that status window. The export Worker runs with background throttling disabled on its host window.

## Screenshot presentation

Screenshot uses the same opaque editor window and native readiness gate as Studio, with a separate Vue editor under `video-editor/screenshot/`. Measure the canvas container once after mount: ResizeObserver can stay idle while the native window is hidden. Notify readiness after the source assets decode and the canvas has painted, or after rendering an actionable load error. Preserve titlebar drag regions and native controls.

For still capture, hide the HUD and selection overlays before requesting Rust capture. Hide the native Crop Bar as well and allow the compositor to commit the hide; do not depend on content protection for screenshot exclusion. The native screenshot request does not start camera, microphone or system audio. Clipboard images are encoded as PNG because Electron NativeImage cannot decode WebP; WebP file exports use Chromium’s encoder directly.


### Screenshot export status

The status pill loads `quick-snip-status.html` independently of App/HUD and imports the video encoder only for a video render task. Screenshot start preloads this window hidden; presentation is requested only after the native capture returns, so the pill cannot enter its own screenshot. Both `ready-to-show` and the mounted renderer's `quick-snip:status-ready` handshake are required before showing it. The capture source preview is replaced by a bounded thumbnail of the styled canvas before clipboard encoding completes.

Completed dismissal starts after native presentation and waits five seconds without interaction. Native window blur clears stale DOM hover/focus; mouse focus cannot keep the pill pinned after pointer departure. Keyboard focus, pending actions and errors remain interactive. Progress updates neither reposition the window nor restart an existing completion deadline.

The native status snapshot publishes the dismissal deadline and frozen remaining time. The renderer uses it for the countdown bar beneath the completion message: pause during interaction or dragging, then restart a full five seconds after interaction ends or the position commits. Animate the bar with compositor transforms; reduced motion uses one-second steps. Keep the bar inside the existing pill bounds and retain the 300 ms hover bridge.

The Quick Snip region overlay includes the shared preset/reset/cancel/confirm toolbar. Its Screenshot bar stays opaque during selection, then is hidden and checked for visibility after a compositor delay before requesting native capture. Windows resolves the selected Electron display center in physical pixels through Rust `resolve-display` (a temporary Per-Monitor V2 DPI context); macOS uses the corresponding CG display ID. Never reuse an unrelated saved source ID for a newly selected display.
