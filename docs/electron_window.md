# Electron windows: behavior and constraints

This application uses transparent, frameless Electron windows as part of the UI. Window bounds are therefore product behavior, not merely layout details. Read this document before changing Electron windows, renderer window sizing, popovers, or mouse interaction.

## Window modes

The main window is controlled by `electron/window/window-controller.cjs` and has three modes.

| Mode | Bounds / behavior | Interaction |
| --- | --- | --- |
| `hud` | `352 × 512`: a `320 × 480` HUD card plus 16 px of room on every edge for its border and shadow. It returns to its prior HUD position after Recorder mode. | Transparent pixels pass through; renderer enables mouse handling only over interactive HUD elements. |
| `recorder` | `72 × 296`, positioned at the right-middle of the active display. It is draggable and remembers a position per display for the process lifetime. | Always on top, fixed size, content protected. Drag starts only on mousedown, never on hover. |
| `editor` | `1280 × 800` before presentation/maximization. | Normal opaque editor interaction. |

Use `window:show-hud` / `capture.showHud()` to return from the editor. Do not reproduce it by separately changing mode, maximize state, size, and position: ordering matters.

## Shadows and content size

Electron clips painting outside the BrowserWindow. A CSS shadow around an element that touches the renderer viewport is therefore visibly cut off and looks like a rectangular dark block.

- Keep the HUD card at `320 × 480`, but keep the BrowserWindow at `352 × 512` and the card inset by `16px`.
- When HUD content changes height or width, include the 32 px outer allowance in the Electron `setSize` request.
- Do not solve a clipped shadow by increasing the shadow token. Prefer reserving physical renderer space first.
- The countdown uses the same rule: its circle is inset by 16 px in a larger transparent window so its border and shadow remain intact.

## Mouse pass-through and focus stealing

Transparent pixels in an Electron window still intercept input unless `setIgnoreMouseEvents` is used.

- HUD: `App.vue` detects an interactive element under the pointer and calls `capture.setInteractive`. Do not make the whole transparent HUD window interactive.
- Camera overlay: starts in pass-through mode. `CameraOverlayApp.vue` enables interaction only for the camera, controls, and open popover.
- Recorder: drag listeners are installed after mousedown and removed on mouseup. Never invoke `drag()` directly from `mousemove` in the template; it makes the bar flee the pointer.
- Countdown: uses its own non-focusable, click-through window. It must never steal focus from the recording target.

## Popovers in transparent windows

Teleporting a popover to `body` does not let it escape its BrowserWindow. It can still be clipped by the native window bounds.

- Generic popovers clamp to their renderer viewport, switch up/down where possible, and limit height with scrolling.
- The Recorder bar expands temporarily to the left while the pointer is over it so its left-hand tooltips can render. It preserves the screen position of the right edge and restores the exact compact bounds on leave.
- The camera popover temporarily expands its native window. Before expansion, store the window bounds; after expansion, offset the rendered camera preview by the inverse native-window displacement. On close, restore both the original bounds and a zero preview offset. Without that compensation, opening the popover visibly moves the camera preview.
- Nested teleported popovers must be registered as descendants using `data-popover-owner`; otherwise selecting an inner `Select` is treated as an outside click and closes its parent.

## Content protection and capture

Recorder mode enables Electron content protection. Camera and Recorder windows must remain separate from the native capture session logic; renderer-side windows are only presentation and sidecar controls. Do not broaden preload APIs beyond narrow, named IPC calls.

## Checklist for a window change

1. Read this document and `docs/ARCHITECTURE.md`.
2. Identify whether the change affects renderer layout, native bounds, input pass-through, or all three.
3. Preserve the relevant content-to-window margin for shadows.
4. Verify transparent regions do not steal clicks or focus.
5. Verify popovers at each screen edge and with nested selects.
6. Verify HUD → Recorder → Editor → HUD restores the intended bounds and position.
7. Run `npm run build:dev` and the focused tests.
