# Electron windows: behavior and constraints

This application uses transparent, frameless Electron windows as part of the UI. Window bounds are therefore product behavior, not merely layout details. Read this document before changing Electron windows, renderer window sizing, popovers, or mouse interaction.

## Window modes

All desktop document entries live in `apps/desktop/html/`; Vite preserves this directory in `dist/html/`. Electron loads `/html/{entry}.html` during development and `dist/html/{entry}.html` in packaged builds. Resolve public images from the build root, one level above the documents, and keep the development renderer permission allowlist aligned with these exact paths.

`bun run dev` starts Vite and Electron in one terminal. Development windows resolve their local origin through `lifecycle/development-session.cjs`, using the launcher's `BEAM_DEV_SERVER_URL`; renderer permissions and HUD source-picker ownership must match that exact origin. Never hard-code a renderer port in a window controller. The worktree path and optional `--session` name select persistent, isolated Chromium directories before the single-instance lock is acquired. Application preferences and shared media stay in `Videos/Beam/user/`, never in the Chromium profile. Projects and screenshots follow the configured project root while retaining their categorized tree and historical locations. Packaged applications keep their normal profile and file URLs.

The transparent main window is controlled by `apps/desktop/electron/window/window-controller.cjs` and owns the HUD and Recorder modes. The editor uses a separate opaque window created by `apps/desktop/electron/window/editor-window.cjs`; this separation is required for native window animations and Windows Snap Layouts.

| Mode       | Bounds / behavior                                                                                                                                                                                                                                                                                                                                                                                                                             | Interaction                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hud`      | Compact at `672 × 268` (temporarily taller while a popover is open): a `640 × 236` HUD card plus 16 px of room on every edge for its border and shadow. The canonical dimensions live in `preferences.json` as `hudWindow`; startup normalization restores them when missing or unexpected. It returns to its prior HUD position after Recorder mode. Dragging is bounded by the physical display bounds, not the taskbar-excluded work area. | macOS/Windows: transparent pixels pass through; renderer enables mouse handling only over interactive HUD elements. Linux: forced X11/XWayland, fully interactive compact native bounds; HUD popovers scroll within them. |
| `recorder` | `352 × 88`, containing a horizontal `320 × 56` pill with 16 px of shadow room, centered near the bottom of the active display work area by default. It is draggable and remembers a position per display in preferences.                                                                                                                                                                                                                      | Always on top, fixed size, content protected. Drag starts only on mousedown, never on hover.                                                                                                                              |
| `editor`   | Independent opaque windows starting at `1280 × 800`, with a native minimum of `960 × 600`.                                                                                                                                                                                                                                                                                                                                                    | `titleBarStyle: hidden` keeps the custom Beam content while Window Controls Overlay supplies the native system buttons. The empty titlebar area uses `app-region: drag`; Beam actions stay in `no-drag` regions.          |

Use `window:show-hud` / `capture.showHud()` to return from the editor. Do not reproduce it by separately changing mode, maximize state, size, and position: ordering matters.

While the editor opens, keep the transparent HUD window visible and replace only its card contents with Beamy, one translated status and a ghost Cancel button. Hide the HUD topbar during preparation. Cancel invalidates pending renderer lookups before the owned `editor:cancel-opening` IPC disposes the pending editor; it resolves opening with `false` and keeps the saved project. Late ready events cannot present a disposed session. Loading progress is phase-based and comes from validated editor lifecycle events (`BrowserWindow` creation, renderer load, project load, timeline load, and first paint); do not replace it with timer-driven progress. After `editor:ready`, demote and hide the native HUD window before showing and focusing the editor window. Verify the HUD is no longer natively visible; if that postcondition fails, do not present the editor above a live HUD. Returning to the HUD restores its selected always-on-top policy.

Disable background throttling while the editor initializes behind its native presentation gate. Main-frame navigation failure, renderer loss, unresponsiveness, or a 30-second startup deadline must reject the open request and dispose only that pending editor window. Keep the requesting controls usable for retry. Bind callbacks to the created window so a late event from a failed attempt cannot close its replacement or quit the HUD.

Commit the HUD's hidden policy before calling native demotion or hide operations. Native focus/blur callbacks must not raise it again during editor presentation. Apply topmost changes only when the policy changes, recording that policy before the native call to prevent reentrant focus events. Automatic editor DevTools follow the same `BEAM_DEVTOOLS=1` opt-in as the HUD and must not activate during loading.

The developer-only recorder launcher is the deliberate coexistence exception. Settings in an editor may reveal the existing HUD window as a real recorder configuration surface without closing the source editor. The HUD must carry the source editor's native media ID, remain the sole owner of recording and sidecar state, and return focus to that editor when dismissed. Once recording completes, the resulting debug project opens in a new independent editor window; never model that window as a native child of the source editor.

Each editor window owns its project context and renderer-ready lifecycle. IPC handlers must resolve the editor session from the sending `webContents`; global project or ready state is not valid when multiple editors coexist. Closing or returning from one editor must not destroy another live editor.

CLI `projects.open` uses the same native editor manager in development and packaged builds, with `disposition: 'new-window'` by default. An explicit `disposition: 'reuse'` retains the active-editor replacement behavior. Keep this policy at the authoring boundary; ordinary in-app project opening continues to reuse its owning editor. A new CLI editor is independent, never a native child or a second recorder owner.

Native window titles identify their role in the operating-system switcher: the HUD/recording page is `Beam Recorder`, while each editor renderer sets its own title to `{project name} - Beam Editor` after loading the project. Keep this renderer-local so concurrent editor windows cannot overwrite one another.

On Hyprland, `lifecycle/hyprland-window-rules.cjs` installs session-only compositor rules for the exact Beam overlay titles and application class after selecting X11. It queries the compositor version and uses its supported rule syntax, with bounded IPC and one command per connection. Editors, Settings, Projects, onboarding and developer windows retain their native decorations. No user configuration file is changed.

## Shadows and content size

Electron clips painting outside the BrowserWindow. A CSS shadow around an element that touches the renderer viewport is therefore visibly cut off and looks like a rectangular dark block.

- Keep the HUD card at `640 × 236` pixels, with a `672 × 268` BrowserWindow and a 16 px inset.
- When HUD content changes height or width, include the 32 px outer allowance in the Electron `setSize` request.
- Do not solve a clipped shadow by increasing the shadow token. Prefer reserving physical renderer space first.
- The countdown uses a centered `560 × 320` transparent window: its `160 × 160` circle, translated Cancel button and shortcut-hint row keep at least 16 px of outer room so the border and shadow remain intact.
- The main HUD header keeps the Beam logo, flexible capture-mode group and window controls in no-drag regions. The countdown entry `apps/desktop/html/countdown.html` loads only its overlay, theme and translations for shortcut hints.

## Mouse pass-through and focus stealing

Transparent pixels in an Electron window still intercept input unless `setIgnoreMouseEvents` is used.

- HUD: `App.vue` detects an interactive element under the pointer and calls `capture.setInteractive`. On macOS and Windows, do not make the whole transparent HUD window interactive; only interactive elements handle mouse events. On Linux, Electron does not implement the `{ forward: true }` mousemove forwarding option (macOS/Windows only), so a click-through HUD could never classify the pointer and would stay permanently click-through. Linux keeps the compact HUD window fully interactive, including its 16 px shadow margin. Never expand it for a popover: the added transparent surface would intercept desktop clicks. `capture.setInteractive` is inert there. Do not use `setShape()` to restore margin pass-through: on Linux the window shape clips drawing as well as input, cutting off popovers and overlay content near the window edges.
- Camera overlay: starts in pass-through mode. `CameraOverlayApp.vue` enables interaction only for the camera, controls, and open popover.
- Camera overlay: opens at `220 × 220` with the video cropped to fill its square window. An exact saved `320 × 180` default adopts the new size while keeping its lower-right anchor where global coordinates are available; custom resized dimensions remain saved.
- Linux explicitly selects `--ozone-platform=x11` before app readiness, including on Wayland desktops via XWayland. Native placement and saved positions use X11 coordinates; do not infer the window backend from `WAYLAND_DISPLAY` or `XDG_SESSION_TYPE`, which still describe the host session. Keep those environment variables intact for Portal capture and host clipboard services. The camera window is opaque on Linux because Electron does not reliably expose native resize edges for fully transparent/decoration-free windows there.
- Recorder: the pill and empty space between controls are native draggable regions. Apply `no-drag` only to each control slot; never put the entire row in a `no-drag` container. The timer remains draggable. Delete, Restart, Pause/Resume and Stop appear in that order; device configuration stays in the capture setup.
- Editor: use the native draggable titlebar region. Do not reintroduce renderer mousemove/IPC window dragging; it bypasses native edge snapping and window transitions.
- Editor: while a titlebar popover is open, temporarily mark the titlebar and its empty drag strip `no-drag` so an outside press can dismiss it. The shared popover state counts nested menus and restores native dragging after the last closes or unmounts; never change native bounds or implement renderer dragging.
- Editor: keep `transparent: false`, `thickFrame: true`, and the native Window Controls Overlay. An HTML maximize button does not expose Windows 11 Snap Layouts.
- Editor: configure Window Controls Overlay with a fixed transparent color and neutral symbol color at construction; omitting `color` lets Windows paint its light system color over a dark editor. Transparent WCO requires Electron 43.2 or newer because Electron 43.1.1 incorrectly fell back to the default frame color for fully transparent values. A live editor theme change is renderer-only: do not update `nativeTheme`, the BrowserWindow background, or `setTitleBarOverlay()` while the window is visible. Use the selected theme only as the next window's initial fallback background.
- Countdown: uses its own non-focusable window. macOS/Windows pass through mouse input outside the Cancel button; its owning renderer alone may change mouse handling. Linux keeps the bounded window interactive because forwarded mouse motion is unavailable. It must never steal focus from the recording target. Cancel notifies only the renderer that requested the active countdown, clears its timer and releases prepared capture. Ignore cancellation after countdown completion or from stale/foreign overlay renderers. Zero seconds skips countdown presentation and starts capture directly.

## Popovers in transparent windows

Teleporting a popover to `body` does not let it escape its BrowserWindow. It can still be clipped by the native window bounds.

- Generic popovers clamp to their renderer viewport, switch up/down where possible, and limit height with scrolling.
- Screenshot Composition is a renderer panel bounded by the canvas workspace, excluding the sidebar and native titlebar. Its header uses pointer capture after a drag threshold, previews with `translate3d`, and commits only its normalized user preference on release. Keep the entire open panel inside the workspace without changing its opening direction or height during dragging. Recalculate direction for a collapsed header and lock it at opening; keep the header anchored. Account for editor UI scaling and cancel gestures on Escape, capture loss, focus loss or workspace resize. This must not move or resize the native editor window.
- Keep the Recorder native window fixed at `352 × 88`, including during hover and drag. Labels use the controls' accessible names and native `title` hints; never resize or reposition the native window to make renderer tooltips overflow because that makes the bar jump under the pointer.
- Recording issues stay in the shared RecorderBar's timer slot: retain the elapsed time and show a compact alert with the complete diagnostic in its accessible name and native title. A warning keeps auto-fade/hover-only controls visible. Preserve the native window bounds and the Delete, Restart, Pause/Resume and Stop controls.
- The camera popover temporarily expands its native window. Before expansion, store the window bounds; after expansion, offset the rendered camera preview by the inverse native-window displacement. On close, restore both the original bounds and a zero preview offset. Without that compensation, opening the popover visibly moves the camera preview.
- Nested teleported popovers must be registered as descendants using `data-popover-owner`; otherwise selecting an inner `Select` is treated as an outside click and closes its parent.
- Screen color selection temporarily holds dismissal of its popover and all ancestor popovers while the operating-system picker owns focus. Release that hold on completion, cancellation and disposal. Linux uses the Screenshot portal's `PickColor` operation in a separate Rust engine process, with the Electron X11/XWayland window ID as parent; never open a ScreenCast session for a pipette or block recording commands while waiting for selection. Main-frame navigation, owner destruction and app shutdown cancel the owned operation.

## Compact recorder lifecycle

`apps/desktop/electron/window/recorder-layout.cjs` owns the shared native size and bottom-center
placement for Studio and Instant. Preferences normalization resets legacy
`recorderPositions`, `lastRecorderPosition` and `quickSnipBarPositions` once via
`extras.recorderLayoutVersion`. Later user moves remain saved per display; never
reuse a different display's last coordinates. Preserve zero and negative X11
origins. Programmatic initial placement must not create a saved user position.

Restart confirmation replaces the pill contents inside its existing bounds. Focus
the Cancel button first, support Escape, and restore focus to Restart after closing.
The current take continues until confirmation. After acceptance, discard it and
wait for successful cleanup before starting with the same configuration and no
countdown. Never export the discarded take or restart after cleanup failure.
Instant's bounded `restarting` report is accepted only from the owning Crop Bar
renderer and for its currently recording job. Native window placement remains
unchanged during restart.

## UI scaling and browser zoom

- `appearance.uiScale` is an editor-only product setting. Do not expose or apply it in the HUD.
- Chromium page zoom is not a product setting. Keep `webPreferences.zoomFactor` at 1, reset persisted page zoom before presenting HUD/editor windows, and block Ctrl/Cmd plus wheel or browser zoom keys. Timeline and canvas zoom handlers may still consume wheel input for their own scoped behavior.
- Keep `hudWindow.width` and `hudWindow.height` at the canonical `672 × 268` values. Preferences normalization must replace missing, malformed, or unexpected values before the HUD window is created.

## Content protection and capture

Recorder mode enables Electron content protection. Camera and Recorder windows must remain separate from the native capture session logic; renderer-side windows are only presentation and sidecar controls. Do not broaden preload APIs beyond narrow, named IPC calls.

## HUD Settings and Projects

Recorder General exposes `launchAtStartup`, enabled by default when absent and preserving explicit false. Only installed native Settings windows receive `--beam-installed`; their preload exposes the narrow `canLaunchAtStartup` capability. Development remains disabled with a translated explanation and never registers the development Electron binary. Desktop initialization applies the saved preference; updates/reset apply OS registration before broadcasting, and roll back saved settings if registration fails. See [startup integration](dev/startup.md) and the [panel measurements](hud-panel-performance.md).

`preferences.alwaysOnTop` controls the Recorder setup window (HUD mode), defaults to true and applies immediately through the window controller. Recording mode keeps the compact bar topmost. Hidden, minimized and editor-transition windows remain demoted regardless of the preference. Cache this policy in the controller; focus/blur must not read preferences from disk or reenter native topmost calls.

Settings focuses its local search input when presented or reactivated. Printable keys within its active renderer start searching unless an editable control owns them; blurred windows and application-wide recording shortcuts must not be intercepted. Instructional thumbnails reuse inert capture cards and RecorderBar, with the preview bar explicitly marked no-drag. They never open streams, enumerate devices, resize native windows or start recordings.

The horizontal HUD card stays at its canonical size while mode and source selections change. Full screen, Region and Window cards open their corresponding chooser and begin capture after confirmation. Linux display/window choices use the Rust Portal flow. Device and Instant preset fields use the shared CSS Select and Popover controls. HUD popovers request temporary native height through the HUD-only `window:resize-hud-popover` IPC. Keep the width and top-left anchor unchanged, include 16 px of shadow room, cap height at 720 px and at available screen space, and restore 268 px after the last menu closes, including blur and unmount. Aggregate nested requests and serialize native resizing so a late expansion cannot overwrite a close. On platforms with global coordinates, a menu at the bottom screen edge clamps and scrolls within the available height. Linux disables this expansion in both the TypeScript provider (`isLinux`) and native IPC; its menus fit above/below their trigger and scroll within the compact native viewport. Never persist temporary menu dimensions or resize Recorder/editor windows from this IPC.

Capture issues live in a toolbar count button with a scrollable hover/focus/click panel and a copy action for each issue. Keep the list scrollbar at the panel edge. Enable interaction on opening, then continue pointer hit testing over both the card and teleported content; transparent added space passes clicks through on macOS/Windows. Linux retains its existing fully interactive policy because Electron cannot forward ignored mouse events there.

Settings and Projects use independent, opaque, resizable windows managed by `apps/desktop/electron/window/hud-panels.cjs`. Settings retains native Window Controls Overlay. Its titlebar and native Window Controls Overlay are 38 px tall, matching Projects and the recorder. Use the existing Lucide Settings/FolderOpen icons at 16 px in `--text-secondary`, with the body-size, title-weight text tokens; the recorder keeps its original 24 px Beam logo. The recorder retains the static Beam product asset. Icons never mount or morph Beamy. Only the Beam wordmark is an interactive, no-drag control for its text easter egg; translated panel titles stay static. Projects is frameless and uses the shared 38 px Beam titlebar with only Close; keep that button outside the native drag region and retain opaque native resize edges. Ctrl+W (and Cmd+W) closes only Projects through its own `before-input-event` handler, before renderer fields and menu accelerators. Projects has no navigation footer: double-click or Enter on a card opens it, and its title is a keyboard-accessible inline rename control. Typing on the standalone Projects page opens and focuses search with the first character preserved; leave inputs, rename/create dialogs, composition and modified shortcuts alone. Compact editor pickers do not install type-to-search behavior. Each role has one live window and loads `apps/desktop/html/hud-panel.html` with a bounded `panel` query. After capture capability warmup and HUD visibility, prepare at most the Settings and Projects renderer shells without mounting their feature content. `hud-panel:prepared` announces the subscribed shell; it does not present a window. An explicit request sends `hud-panel:visibility=true`; show each panel only after native readiness and `hud-panel:ready` from its own mounted feature. Restore background throttling after shell preparation. A failed load, renderer loss, unresponsiveness or 30-second deadline disposes that attempt and permits retry. Closing successfully presented Settings or Projects hides and demotes the native window, sends `hud-panel:visibility=false`, and unmounts its feature content; the loaded renderer shell stays cached. Reopening mounts fresh feature content and waits for its own readiness signal again. App shutdown destroys both shells. Closing a pending attempt or Mascot Lab still destroys it. Cached hidden renderers cannot request projects or developer actions. Reset browser zoom before presentation and keep the titlebar draggable. Visible panels follow the HUD's actual native always-on-top state, using its Windows screen-saver level there and the ordinary topmost level on Linux/macOS. Record the policy before native calls, then focus and raise the panel; minimizing, hiding or disabling the HUD preference demotes it. These panels remain independent opaque windows, with no native parent or recorder-bound changes.

Development Settings also opens the independent Mascot Lab through the same readiness gate. Its initial size is `1280 × 900`, with a native minimum of `960 × 640`; content scrolls below the draggable titlebar. Only the live Settings renderer may invoke `developer:open-mascot-lab` or `developer:open-devtools`. The latter opens detached DevTools for that Settings window. Packaged builds register neither handler, omit developer navigation/search entries and do not import the lab. Closing Settings must not destroy an already opened lab; application shutdown disposes both. Lab presets and eye geometry affect only lab previews and exports.

Projects starts at `720 × 560`, with a native minimum of `560 × 440`. Its virtual grid measures the actual list width, computes square card dimensions and updates row heights and scroll anchoring on resize. Start only the selected view import alongside the locale and appearance bootstrap; mount once all three are ready. Panel readiness must not depend on a background animation frame. Thumbnail decoding is lazy, limited to two concurrent inputs and visible rows, including the small virtualization overscan. Editor pickers retain mounted content between openings but pause queued work and hover playback while hidden.

Only the HUD can request Settings and Projects through their named preload methods. Only the Projects renderer can request a validated UUID and capture mode through `hud-panel:open-project`. It delegates opening to the HUD's existing editor lifecycle; the panel never acquires editor ownership. Preferences and theme changes broadcast to all windows through the existing preferences store.

The region overlay waits for both native readiness and `screen-region:ready` from its mounted renderer before delivering configuration and showing. Construct it with exact display bounds; Linux uses the forced X11 backend for placement instead of compositor fullscreen. Preserve the renderer opacity mask and transparent crop interior. Linux screen/window recording still belongs to Rust and the XDG Portal; forcing Electron to X11 does not replace that capture backend.

Default region selection hides the HUD and asks Rust for an uncropped desktop PNG before presenting the selector. On Linux, the Portal chooses the monitor first; its geometry must match the Electron display, and Rust retains the authorized session for the subsequent crop recording or screenshot. Use that snapshot only inside the magnifier; never paint it across the selector or inside the crop, which must remain transparent to the live desktop. Canceling or failing selection releases the retained session. A failed native load, renderer loss, unresponsiveness or 30-second readiness deadline disposes the selector and permits retry.

Keep dimensions visible and exact while dragging. Presets and recording controls hide during deliberate gestures and return with a reduced-motion-aware spring transition. A click or movement shorter than 8 logical pixels preserves the previous crop. Keep the magnifier below controls in the renderer stacking order.

Selection controls reserve 16 px at every display edge for their border and shadow, including a Full screen crop. Measure both control groups, preserve their last visible size during gestures, and refresh renderer geometry on configuration. Controls above a crop or near the bottom display edge anchor from their bottom edge so wrapping and device errors cannot push them off screen before measurement catches up.

On Linux and Windows 10, recording markers use opaque, non-focusable, click-through strips entirely outside the crop; omit strips at display boundaries. Each strip waits for its own themed renderer before showing. Never replace this with a display-sized protected Linux/Windows 10 window. On macOS, pass auxiliary native window IDs to ScreenCaptureKit explicitly: Electron content protection alone does not exclude them. Linux cannot exclude a teleprompter from monitor capture, so constrain it outside the crop, using another display when available, and explain when there is insufficient room. Restore its original bounds when capture finishes or selection is canceled.

Windows hides visible taskbar and desktop icon windows in Rust and restores those same windows on normal completion, cancellation and failure. macOS filters Dock and desktop icon layers from the native capture instead of altering desktop preferences. Linux desktop hiding is unavailable and its switches stay disabled.

## HUD auxiliary window lifetime

The shared source picker opens for Windows/macOS window selection and for screen
selection when more than one screen is available. A single native screen is
selected directly. Linux retains Portal selection. `DEV_CROSSPLATFORM=1` in an
unpackaged launch replaces only the source provider with 3 simulated screens and
21 simulated windows, including on Linux. It uses the same picker component and
controller. Fixture IDs never reach Rust; confirmation exercises the existing
countdown without starting a real recording.

The chooser is one transparent, frameless child of the HUD, centered on that display
and clamped to its work area. Keep its native bounds fixed for the entire session,
including during hover, scrolling and preview refresh. Reserve 16 px around its
single translucent panel; do not add CSS or native shadows or a glow. Never expand
it to cover the desktop.

Keep the source kind chosen in the HUD. The recorder-sized 38 px header contains a
vertically centered title, small search field and top-right Close button. Use a
compact horizontal thumbnail row with the shared ScrollShadow and keyboard/mouse
wheel scrolling, with no inline preview, Play button or footer. Clicking,
double-clicking or pressing Enter selects that exact ID and confirms through the
existing HUD countdown and capture flow. Zero seconds starts capture directly.

Hover retains chooser keyboard focus while Rust raises the real source window
without activating it or making it permanently topmost. The source stays behind
the selector. A selected source remains the background when hover ends. Without a
selection, clear the hover and stop live refreshes on pointer exit or focus loss.
Bridge card-to-card pointer and keyboard transitions for 80 ms so the background
window is not hidden and shown again across each gap. Actual chooser exit or
window focus loss clears immediately. Reuse the preview component on source
changes; do not key it by source ID or repeat the renderer readiness handshake.
Ignore late thumbnail results, but restore the chooser above any already-raised
source even when that result is discarded. Serialize pending inspection before
raising the exact clicked source and handing off to the countdown. Source capture
retains its full native bounds; preview dimensions never change the capture region.
Windows inspection converts physical bounds to Electron DIP coordinates; macOS
retains ScreenCaptureKit bounds. Display native inspection errors without clearing
another selected source.

For development fixtures and screen selection, a separate click-through target
surface simulates the background source. It is non-focusable on Windows/macOS.
On Linux it must remain focusable in construction: `focusable: false` bypasses the
window manager and forces it above managed windows even with `alwaysOnTop: false`.
Present it with `showInactive`, ignore mouse input and never call `focus` on it.
Keep its native bounds fixed and fit the source aspect ratio within them; screen previews are
limited to `640 × 350`, never the full display. This target is a normal native
window, not always on top. The chooser alone uses the `screen-saver` topmost level,
and is raised after showing the target or inspecting a real window. Keep explicit
renderer stacking too: the browser fixture backdrop is below the chooser. This
ordering applies to Window and Full screen regardless of renderer readiness order.
Do not add another glow/aura window.

Destroy the picker before resolving selection to the HUD, before any countdown
or recording starts. It requires both native and mounted readiness, has a startup
deadline, and is disposed on cancel, failed load, renderer loss, HUD close or
shutdown. No picker geometry is persisted. Only the owning HUD may open it; only
the owning chooser renderer may mutate its validated source state.

macOS picker sources come exclusively from the filtered Rust catalogue, rather
than Chromium's broader window enumeration. Keep only titled, normally layered
application windows with valid bounds and bundle identity. Exclude Control Center,
SystemUIServer, Dock, Notification Center, screenshot UI and WindowManager by
bundle identity, including their layer-zero surfaces. Do not exclude real Apple
applications, small documents, or windows in other Spaces by title or size guesses.
Apply this same policy again when inspecting a selected native window.

Run `DEV_CROSSPLATFORM=1 bun run dev`. For layout
inspection without Electron, Vite also serves
`/html/source-picker.html?preview=1&kind=window` (or `kind=screen`); that development-only
route supplies the fixture catalogue to the production picker component.

The teleprompter uses a natively transparent BrowserWindow. Its saved opacity applies to the renderer body so the script, toolbar and teleported popovers fade together. Keep its resize grip wired to the owner-validated `teleprompter:resize` IPC because frameless transparent Linux windows may have no native resize edges. Clamp requested sizes before presentation and resolve Linux crop exclusion before committing bounds.

The editor window manager prepares the countdown and teleprompter after the first native HUD presentation and completion of the capture capability warmup, and whenever the user returns to the HUD. Initial preparation must not compete with Linux encoder probing or block HUD presentation. Cancel deferred preparation on manager destruction; skip it when the HUD has since hidden or the application is shutting down. Explicit teleprompter/countdown requests still prepare their own renderer immediately. Both auxiliary windows are released once the editor can be presented and the HUD is hidden. A canceled countdown (`show(null)`) must not recreate a released window.

Disable background throttling for both auxiliary renderers. Countdown presentation requires native loading and `countdown:ready` from the owning renderer, sent only after its event subscriptions are installed. Queue the latest value until both signals arrive; foreign and stale renderers cannot complete the handshake.

Before releasing the teleprompter, hide it and request a checkpoint from its renderer. The renderer flushes pending document/preferences saves and returns its draft, matching session, reading line, scroll position and paused/editing state. Only the owning webContents can acknowledge the unique checkpoint request. A timeout or invalid checkpoint retains the renderer to preserve the draft; returning to the HUD during a pending checkpoint cancels disposal. Restore the matching state before announcing renderer readiness. Native loading and renderer readiness must both complete before showing a requested reader. Hidden readers do not autoscroll: use the native visibility notification as well as page visibility, because a preloaded `show: false` window can initially report `document.hidden === false`. Restore the saved scroll offset with instant scrolling so CSS smooth scrolling cannot move it while the renderer is being prepared.

Keep bounds persistence and existing visibility intent across suspension. Capture each native window instance in load/close callbacks so stale callbacks cannot destroy a replacement; failed loads must allow preparation to retry. The narrow preload methods are `getTeleprompterResumeState`, `onTeleprompterSuspend`, `acknowledgeTeleprompterSuspend` and `notifyTeleprompterReady`.

## Checklist for a window change

Experimental Linux FFmpeg export creates a dedicated hidden, opaque offscreen window with `useSharedTexture: true`, sandbox/context isolation enabled, Node integration disabled and a dedicated export-only preload. It never changes recorder window bounds, focus, transparency or X11 policy. Deny navigation/popups and accept export IPC only from that window's main frame. Pause texture capture before drawing and resume after compositor presentation; `webContents.invalidate()` is unsuitable because its cached paint event can be a CPU bitmap. Ignore bitmap events. Release GPU textures after the native consumer acknowledges its read. Cancellation, renderer loss and owner teardown must destroy the export window and stop its native processes. Capture the webContents ID while the window is alive so cleanup remains valid after unexpected destruction.

Full-canvas HTML preview uses a sandboxed `allow-scripts` iframe inside the existing editor, with no native preview window, shared GPU textures or changes to X11 policy. Never grant `allow-same-origin`, preload access, camera/microphone/display capture, popups or top navigation. A main-frame-only IPC supplies a frozen-bundle capability URL. Apply a restrictive CSP and block navigation/redirects originating in the preview frame. Verify message source and HTML revision; no source code executes in the privileged editor renderer. Pointer events and tab focus remain on the editor, preserving Space and seek shortcuts. Closing or replacing the source unmounts the iframe and releases its listeners/deadlines. Exact native capture remains separate for export, thumbnails and explicit screenshot actions.

The recorder's HTML contains a small static export of the Mascot Lab loading dots before Vue is imported. Its lightweight shared shape engine and theme tokens load independently of the application, without fonts, an animation library, a timer that delays presentation, or a new native window. The 72 px portrait starts as loading dots; only a load lasting three seconds shows its brief triangle transition. Remove it immediately for transparent camera, region, crop and teleprompter overlays. Remove the recorder shell on the first frame after mounting Vue; respect reduced motion and preserve the HUD's 16 px outer margin. Startup failures keep a readable error and native reload button available before Vue exists. These two bootstrap elements intentionally cannot use Vue UI primitives.

`beam:renderer-bootstrap` measures the renderer import, selected-language initialization and first mounted frame. Native development startup logs include module loading, beginning at the first line of `main.cjs`. Read `docs/recorder-performance.md` for measurement limits and profiling. The frameless application has no default application menu; custom tray and context menus remain independent.

The region selector loads `apps/desktop/html/screen-region.html` independently of App/HUD. Load its hidden renderer in parallel with native preview preparation, with background throttling disabled. Present only after the preview, native readiness and renderer subscription have completed. Cancelled or failed preparations must remain hidden and release their authorized capture source. The floating region toolbar uses its intrinsic width independently of its screen position; keep its last positive measurement while `v-show` hides it so its spring begins at the final clamped coordinates.

1. Read this document and `docs/ARCHITECTURE.md`.
2. Identify whether the change affects renderer layout, native bounds, input pass-through, or all three.
3. Preserve the relevant content-to-window margin for shadows.
4. Verify transparent regions do not steal clicks or focus.
5. Verify popovers at each screen edge and with nested selects.
6. Verify HUD → Recorder → Editor → HUD restores the intended bounds and position.
7. Verify Ctrl/Cmd plus wheel, `+`, `-`, and `0` cannot change HUD or editor browser zoom, while editor timeline/canvas zoom still works.
8. Run `bun run build` and the focused tests.

## Quick Snip selection and Crop Bar

Opening Quick Snip presents only its independent toolbar, centered at the bottom of the current display's work area unless a committed position is saved. Its neutral icon buttons select screen, region or window without opening a chooser. Only the primary capture action opens the chosen screen/window picker on Windows/macOS or starts region drawing; capture waits for confirmation. Linux screen and window choices use the native Portal during preparation (`portal:monitor` / `portal:window`); window capture sends `region: null`. Region opens the native drawing overlay with `drawOnly: true`, hides the toolbar, and starts the same job when the single Start action or Enter confirms the drawing. Escape returns to the toolbar. Keep native source selection owned by the requesting toolbar and cancel it when its job is canceled.

Present the overlay after `ready-to-show`; present the Crop Bar after both native readiness and the `quick-snip:crop-ready` message from its mounted Vue component. `ready-to-show` alone does not mean an asynchronously imported component has subscribed to IPC. Deliver the latest configuration before any queued command, and discard a queued start when the window is hidden or canceled.

Keep the `616 × 76` native bounds with 10 px margins around the controls, and disable background throttling for the recorder hosted in this window. Use macOS native vibrancy and Windows acrylic for the desktop blur; Linux uses the translucent theme surface. Native blur needs verification on those target platforms. Configuration objects sent into capture IPC must contain plain values, never Vue reactive proxies.

The single row uses the shared Video/Image button group with Beam's custom capture icons, icon-only screen/region/window and device controls, Settings, and an icon-only capture action. Both modes capture directly with their preset; video jobs use Instant storage and export without opening Studio. Export format comes from the preset. Clicking, right-clicking or pressing Shift+F10 on a microphone, camera or system-audio control opens the shared `PopoverMenuList` in the Crop Bar-owned menu window. Suppress browser and native system context menus on the toolbar. Only its renderer may request this bounded menu, and leaving selection closes it. Browser device discovery does not open a stream to obtain labels. System audio offers the default system output and Off. Hide audio, microphone and camera controls in Image mode. Off controls use red crossed-out icons. The grip and every empty area of the toolbar use native dragging; all interactive control slots remain `no-drag`. Moving the native parent dismisses its panel. The single circular 40 px primary action stays centered in a reserved right-hand slot in both modes. Shared horizontal reveal motion arranges the device controls, and a short opacity/scale transition changes the capture symbol without filtering the button.

Settings and devices share one owned transparent menu window: a 266 px panel, 10 px outer shadow margins and 6 px for its pointer. Settings content fits between 200 and 420 px; device content fits between 32 and 360 px. Anchor the pointer to the actual trigger rectangle, place above or below it, and clamp to the display work area. Never expand the toolbar to fit its menus. Wait for native readiness, mounted renderer readiness and a fresh content measurement on every opening, including reuse; include the panel border in the measured height and ignore unchanged measurements to avoid positioning loops. Discard canceled presentations and destroy failed or unresponsive renderers so reopening can retry. Blur closes the menu after a short focus-handoff delay unless its toolbar has focus. A second cog press closes it; preserve that intent from pointerdown through native blur. Toolbar presses outside menu triggers and parent movement dismiss the panel. Escape first closes a nested select; a renderer-owned dismiss message then closes the settings panel and focuses its toolbar. Reuse the same settings panel as Region recording, with only its `showPreset` branch adding the preset selector. Its shared Select constrains its virtual list to the available anchor space, with one scrollbar only when necessary. Panels are fluid within their native width and never scroll horizontally; use the small shadow token inside the reserved margins. Prepare this one hidden menu renderer after the selecting toolbar mounts, and release it on leaving selection or terminal cleanup. Screenshot composition modules load only after actual still capture, not when opening the toolbar. Animate its shell from the trigger-side pointer for 150 ms, respecting reduced motion. Linux uses the native popup-menu type and macOS disables native window animation so the compositor does not add a competing window reveal. User dismissal finishes this short close motion before hiding; capture teardown always hides immediately. Source-tab updates never set the capture button loading state. The ten artificial presets exist only in the isolated development preview at `/html/quick-snip-preview.html`; they never enter user preset storage. Countdown, desktop visibility and Off/2D/3D automatic zoom are saved preferences, with 2D as the first-run zoom choice.

Keep selection controls fully visible. During recording, honor the same `recordingBar.visibility` preference as Recorder: always visible, 15% opacity until hovered, or hidden until hovered. Hover and keyboard focus restore full opacity. Preserve the native window so it can receive hover and stop/cancel commands. Excluding the bar from video is separate from its desktop visibility: Windows uses Electron content protection (`WDA_EXCLUDEFROMCAPTURE` on supported Windows), and macOS explicitly excludes the Crop Bar's window ID in ScreenCaptureKit. `setContentProtection` alone does not exclude recent ScreenCaptureKit captures. These paths require visual recording checks on their target OS.

Canceling the native source picker returns the same Quick Snip job to selection. Restore the existing Crop Bar without repositioning it, reopening the picker or showing the HUD; retain mode, preset and devices. Only the owning Crop Bar may report this cancellation, and only the matching preparing job may handle it. A real failure keeps its details and copy action; the X inside the failed pill is also an enabled native-hit-testable dismiss button.

Linux system-audio preview subscriptions are shared by renderer identity in `capture/system-audio-preview.cjs`. A closing or disabled window releases only its subscription. The Rust engine stops the native preview for recording preparation; retain subscribers, invalidate the cached preview state, and let their next level poll resume the preview only when the engine is idle or terminal. Never start another preview during an active capture.

Use native draggable regions for the grip without a containing `no-drag` region. Track `move` on Linux as well as `moved` on Windows/macOS, ignoring both notifications for programmatic bounds changes. Linux window placement uses the forced X11 client backend even when the desktop session is Wayland.

During selection, persist the Crop Bar position by display ID under `extras.quickSnipBarPositions`. Video start switches it once to the shared horizontal Recorder dimensions and bottom-center placement, using `extras.recorderPositions`; later recording reports do not move or resize it. Native source cancellation restores the selection layout and its position. Screenshot keeps the selection layout. Persist the recording position independently of the selection position. Restore and clamp it to that display's work area on reopening, then treat it as user-positioned so selection updates cannot overwrite it. Movement updates memory only; commit on Windows `moved`, or after 350 ms without movement on Linux/macOS (`moved` is an alias of `move` on macOS). Flush pending movement before hide/destroy. Programmatic placement and unchanged coordinates never write preferences. Preserve valid negative coordinates and zero origins on platforms that expose them; accept the X11 origin `(0, 0)` even on a Wayland host session.

## Quick Snip status window

Quick Snip uses a fixed `380 × 184` transparent always-on-top status window. Its `356 × 76` pill sits 12 px inside the bottom edge when actions open above, or the top edge when they open below. On initial placement and committed movement, choose the side with more space in the display work area. Compensate the native Y origin by the 84 px reserved action space when changing side so the pill stays at the same screen coordinates. Clamp the full surface to the work area. Reveal actions with opacity and `translate3d`, preserving native bounds and pill position during hover. Progress updates must not call `setPosition`, `setSize`, `showInactive`, or `moveTop` repeatedly. Show only after renderer readiness, without focusing the window.

Persist the visible pill's X/Y (not the native window's origin) by display ID under `extras.quickSnipStatusPositions`, using the same movement commit policy as the Crop Bar. Restore its side from available space. Send `popoverSide` with the status snapshot, including the initial lookup, so renderer alignment matches native placement even if the component subscribes after window readiness. Movement suspends the completed-widget close timer until commit. Use the actual X11 window coordinates for screen-edge detection on Linux.

Empty space inside the pill and its revealed details uses native draggable regions. Keep the thumbnail, status text, progress value, and action row in `no-drag` regions so hover and controls remain available. Hidden details and transparent outer margins are not drag handles. Place the window only on initial presentation; recalling an existing status window preserves its user-chosen position.

Bridge the gap between the pill and its actions with a transparent `no-drag` hit area overlapping both surfaces. Keep hover interaction active for 300 ms after mouse exit, canceling that delay on reentry, so crossing native drag regions cannot immediately close the panel or restore mouse pass-through. The completed file-copy action includes its translated label and icon.

Errors keep the details expanded and interactive even without hover. Keep the error row in `no-drag`, allow text selection, and use the shared `CopyButton` with native hints to copy the full message. Terminal dismissal remains enabled while another action is pending. The error row and action row must fit within the existing native margins.

A null render-task notification cancels the current export Worker while keeping the status window alive. Give each task its own AbortController and ignore initial task lookups superseded by newer notifications; canceling an export for editor handoff must not leave an encoder running behind the loading editor.

On Windows/macOS, use `setIgnoreMouseEvents` with forwarding and toggle interactivity only for the pill, its revealed controls, keyboard focus or a pending action. On Linux, keep the native surface interactive: forwarded mouse motion is unavailable, and Linux uses X11 placement. Do not use `setShape` to simulate pass-through.

Completion starts a five-second close timer, paused during interaction. This timer affects only the widget; file copies have no expiry and remain until the user replaces the clipboard. File clipboard publication belongs to `apps/desktop/electron/clipboard/file-clipboard.cjs`, independently of status renderer lifetime. Errors remain visible. Timer disposal and renderer teardown must clean up export jobs. Capture the WebContents reference while the window is alive; reading `BrowserWindow.webContents` inside its destruction callback throws. Ignore readiness callbacks from closed or replaced windows, and discard their pending render tasks. Main-process Quick Snip actions must verify the status sender. When opening the editor, cancel unfinished export work while keeping the status requester alive to display any failure; close it only after successful presentation and only if it still owns that status window. The export Worker runs with background throttling disabled on its host window.

## Screenshot presentation

Screenshot uses the same opaque editor window and native readiness gate as Studio, with a separate Vue editor under `screenshot/`. Measure the canvas container once after mount: ResizeObserver can stay idle while the native window is hidden. Notify readiness after the source assets decode and the canvas has painted, or after rendering an actionable load error. Preserve titlebar drag regions and native controls.

Screenshot fullscreen preview is renderer-only. Keep its full-viewport backing opaque for both transition directions; fading or scaling that backing exposes the ambient editor background and causes a bright flash. Animate only the image, preserving reduced motion, and keep preview zoom/pan separate from output dimensions and browser zoom. Floating frosted editor chrome never changes native bounds or transparency.

For still capture, hide the HUD and selection overlays before requesting Rust capture. Hide the native Crop Bar as well and allow the compositor to commit the hide; do not depend on content protection for screenshot exclusion. The native screenshot request does not start camera, microphone or system audio. Clipboard images are encoded as PNG because Electron NativeImage cannot decode WebP; WebP file exports use Chromium’s encoder directly.

### Screenshot export status

The status pill loads `apps/desktop/html/quick-snip-status.html` independently of App/HUD and imports the video encoder only for a video render task. Screenshot start preloads this window hidden; presentation is requested only after the native capture returns, so the pill cannot enter its own screenshot. Both `ready-to-show` and the mounted renderer's `quick-snip:status-ready` handshake are required before showing it. The capture source preview is replaced by a bounded thumbnail of the styled canvas before clipboard encoding completes.

Completed dismissal starts after native presentation and waits five seconds without interaction. Native window blur clears stale DOM hover/focus; mouse focus cannot keep the pill pinned after pointer departure. Keyboard focus, pending actions and errors remain interactive. Progress updates neither reposition the window nor restart an existing completion deadline.

The native status snapshot publishes the dismissal deadline and frozen remaining time. The renderer uses it for the countdown bar beneath the completion message: pause during interaction or dragging, then restart a full five seconds after interaction ends or the position commits. Animate the bar with compositor transforms; reduced motion uses one-second steps. Keep the bar inside the existing pill bounds and retain the 300 ms hover bridge.

The Quick Snip drawing overlay shows dimensions and a single Start action after drawing; Enter also confirms, including from a focused toolbar button. Region recording retains its device and settings toolbar. Ignore Enter in editing fields and open menus. Its Screenshot bar stays opaque during selection, then is hidden and checked for visibility after a compositor delay before requesting native capture. Windows resolves the selected Electron display center in physical pixels through Rust `resolve-display` (a temporary Per-Monitor V2 DPI context); macOS uses the corresponding CG display ID. Never reuse an unrelated saved source ID for a newly selected display.

## Tray standby

Quick Snip is its own first tray action, separated from Show/Hide Beam and Quit. While selecting, its tray action dismisses the toolbar; while recording, it stops capture. It does not wake the HUD to open Quick Snip.

After a hidden HUD remains idle for one second, navigate only that HUD to a minimal local `data:` document to release its application graph and media. Retain the native window/controller identity and reload its exact session URL before showing it or delivering a HUD shortcut. Never unload a recording, a source selection, a screenshot operation, onboarding, or an editor/project. Checkpoint the teleprompter before releasing auxiliary windows; cancel pending standby on wake or visibility changes. Native audio preview ownership is released on main-frame document navigation, as well as destruction.

After Quick Snip reaches a terminal state, its renderer acknowledges idle only after pending capture work and recorder finalization finish. The main process validates both the owner and terminal state before destroying its toolbar and menu renderers. A late ready message after cancellation also releases the unused toolbar. Active capture and export windows keep their readiness and ownership gates.

HTML thumbnail surfaces use per-WebContents isolated zoom so their reduction cannot change export surfaces on the same loopback origin. Keep Chromium’s 25% minimum and the original logical composition dimensions; normalize device scaling before encoding. Their authenticated frame URLs accept only the 240/480/960 px thumbnail tiers. Decoding and WebP conversion run in a runtime worker, with bounded caching and teardown.

## Onboarding

Onboarding uses its own opaque 920 × 720 window (minimum 800 × 600). Present it only after its own `ready-to-show`; a replaced or destroyed window cannot present through a late callback. The renderer keeps the welcome photograph behind centered content, reserves macOS traffic-light space and marks only the titlebar as draggable. Its shared ScrollShadow keeps settings scrollable while Back and Next remain visible at the left and right of the footer. Six keyboard-accessible steps use the embedded Recorder and the shared Quick Snip selection bar; those previews cannot launch native capture. Photography is bundled locally; mounting the introduction never activates a capture device or prompts for permissions. Explicit completion persists preferences before returning to the HUD, and persistence failures leave the introduction open for retry. Native close remains a dismissal.
