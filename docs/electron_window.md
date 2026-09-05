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

The developer-only recorder launcher is the deliberate coexistence exception. Settings in an editor may reveal the existing HUD window as a real recorder configuration surface without closing the source editor. The HUD must carry the source editor's native media ID, remain the sole owner of recording and sidecar state, and return focus to that editor when dismissed. Once recording completes, the resulting debug project opens in a new independent editor window; never model that window as a native child of the source editor.

Each editor window owns its project context and renderer-ready lifecycle. IPC handlers must resolve the editor session from the sending `webContents`; global project or ready state is not valid when multiple editors coexist. Closing or returning from one editor must not destroy another live editor.

Native window titles identify their role in the operating-system switcher: the HUD/recording page is `Beam Recorder`, while each editor renderer sets its own title to `{project name} - Beam Editor` after loading the project. Keep this renderer-local so concurrent editor windows cannot overwrite one another.

## Shadows and content size

Electron clips painting outside the BrowserWindow. A CSS shadow around an element that touches the renderer viewport is therefore visibly cut off and looks like a rectangular dark block.

- Keep the HUD card at `320 × 480` pixels, with a `352 × 512` BrowserWindow and a 16 px inset.
- When HUD content changes height or width, include the 32 px outer allowance in the Electron `setSize` request.
- Do not solve a clipped shadow by increasing the shadow token. Prefer reserving physical renderer space first.
- The countdown uses the same rule: its circle is inset by 16 px in a larger transparent window so its border and shadow remain intact.

## Mouse pass-through and focus stealing

Transparent pixels in an Electron window still intercept input unless `setIgnoreMouseEvents` is used.

- HUD: `App.vue` detects an interactive element under the pointer and calls `capture.setInteractive`. On macOS and Windows, do not make the whole transparent HUD window interactive; only interactive elements handle mouse events. On Linux, Electron does not implement the `{ forward: true }` mousemove forwarding option (macOS/Windows only), so a click-through HUD could never classify the pointer and would stay permanently click-through. Linux therefore keeps the HUD window fully interactive; the 16 px transparent margin then also captures clicks, which is the accepted Linux trade-off. `capture.setInteractive` is inert there. Do not use `setShape()` to restore margin pass-through: on Linux the window shape clips drawing as well as input, cutting off popovers and overlay content near the window edges.
- Camera overlay: starts in pass-through mode. `CameraOverlayApp.vue` enables interaction only for the camera, controls, and open popover.
- Wayland intentionally reports global window coordinates as `(0, 0)`, so absolute overlay placement cannot be persisted or restored there. Do not force XWayland globally: incompatible GPU/X11 stacks can prevent the HUD from rendering. The camera window is opaque and keeps its compositor shadow on Linux because Electron does not reliably expose native resize edges for fully transparent/decoration-free windows there.
- Recorder: only the visible grip is a native draggable region. Keep the rest of the bar in `no-drag` so Chromium continues to deliver hover and pointer events to the controls.
- Editor: use the native draggable titlebar region. Do not reintroduce renderer mousemove/IPC window dragging; it bypasses native edge snapping and window transitions.
- Editor: keep `transparent: false`, `thickFrame: true`, and the native Window Controls Overlay. An HTML maximize button does not expose Windows 11 Snap Layouts.
- Editor: configure Window Controls Overlay with a fixed transparent color and neutral symbol color at construction; omitting `color` lets Windows paint its light system color over a dark editor. Transparent WCO requires Electron 43.2 or newer because Electron 43.1.1 incorrectly fell back to the default frame color for fully transparent values. A live editor theme change is renderer-only: do not update `nativeTheme`, the BrowserWindow background, or `setTitleBarOverlay()` while the window is visible. Use the selected theme only as the next window's initial fallback background.
- Countdown: uses its own non-focusable, click-through window. It must never steal focus from the recording target.

## Popovers in transparent windows

Teleporting a popover to `body` does not let it escape its BrowserWindow. It can still be clipped by the native window bounds.

- Generic popovers clamp to their renderer viewport, switch up/down where possible, and limit height with scrolling.
- Keep the Recorder native window fixed at `72 × 344`, including during hover and drag. Labels use the controls' accessible names and native `title` hints; never resize or reposition the native window to make renderer tooltips overflow because that makes the bar jump under the pointer.
- The camera popover temporarily expands its native window. Before expansion, store the window bounds; after expansion, offset the rendered camera preview by the inverse native-window displacement. On close, restore both the original bounds and a zero preview offset. Without that compensation, opening the popover visibly moves the camera preview.
- Nested teleported popovers must be registered as descendants using `data-popover-owner`; otherwise selecting an inner `Select` is treated as an outside click and closes its parent.

## UI scaling and browser zoom

- `appearance.uiScale` is an editor-only product setting. Do not expose or apply it in the HUD.
- Chromium page zoom is not a product setting. Keep `webPreferences.zoomFactor` at 1, reset persisted page zoom before presenting HUD/editor windows, and block Ctrl/Cmd plus wheel or browser zoom keys. Timeline and canvas zoom handlers may still consume wheel input for their own scoped behavior.
- Keep `hudWindow.width` and `hudWindow.height` at the canonical `352 × 512` values. Preferences normalization must replace missing, malformed, or unexpected values before the HUD window is created.

## Content protection and capture

Recorder mode enables Electron content protection. Camera and Recorder windows must remain separate from the native capture session logic; renderer-side windows are only presentation and sidecar controls. Do not broaden preload APIs beyond narrow, named IPC calls.

## Checklist for a window change

1. Read this document and `docs/ARCHITECTURE.md`.
2. Identify whether the change affects renderer layout, native bounds, input pass-through, or all three.
3. Preserve the relevant content-to-window margin for shadows.
4. Verify transparent regions do not steal clicks or focus.
5. Verify popovers at each screen edge and with nested selects.
6. Verify HUD → Recorder → Editor → HUD restores the intended bounds and position.
7. Verify Ctrl/Cmd plus wheel, `+`, `-`, and `0` cannot change HUD or editor browser zoom, while editor timeline/canvas zoom still works.
8. Run `bun run build` and the focused tests.
