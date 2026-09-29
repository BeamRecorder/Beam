# Native recorder controls — 2026-09-29

The recorder controls were measured at 680 × 252 on a private X11 display.
`packages/beam-ui/test/controls.automation.tsx` also mounts the production Select,
SegmentedControl and capture quick settings in the ARGUI QuickJS automation host.
Native probes use isolated Beam preferences and the private compositor helper;
they never manipulate the user's desktop. No compilation ran alongside the
final native latency measurement.

## Select opening

The native probe times an XTest mouse click until its new popup is mapped.
It polls mapping every 2 ms; these values include OS scheduling and do not
measure when a physical monitor displays the frame.

| Observation | Before, warmed renderer | Final build |
| --- | ---: | ---: |
| First popup in the measured sequence | 48.97 ms | 31.89–63.65 ms across two runs |
| Subsequent openings | 41.45–75.52 ms | 19.70–32.98 ms across two runs |
| GPU renderer setup | 10.91–23.72 ms | 2.00–3.17 ms on reuse |
| Registering the entire application asset catalog | 8.84–22.12 ms | Replaced by registration of referenced assets |

An earlier cold sequence measured 139–256 ms. Cache warmup changes the results
substantially, so it is excluded from the comparison above. Separate intermediate
runs after the fix measured 13–29 ms for repeated openings. First opening still
initializes the renderer and remains variable; only subsequent openings benefit
from renderer reuse. These are local observations rather than cross-platform
latency guarantees.

The runtime keeps at most one spare popup renderer per application. Each new
logical popup still receives a new OS window and owner; GPU pipelines and asset
versions can be reused. Registering only referenced assets avoids reparsing every
SVG for a small menu. Surface replacement clears retained scene/damage caches.
Tests cover changed asset versions, invalid referenced SVGs and unused invalid
assets. Nested menus remain separate native windows.

## Behavioral checks and limits

- Automation captures the first tab transition at 50 ms and after settling.
  Previously the first capture already showed the final indicator; the corrected
  capture contains an intermediate position. Responsive geometry replaces only
  the indicator, so resize does not inherit the selection animation.
- The native preparation bar opens its countdown submenu on hover. Selecting
  5 seconds writes `extras.nativeCountdownSeconds: 5` in its isolated preferences.
  The former numeric inline labels caused a rejected native String wire value
  and stopped the bar actor. Solid now normalizes inline text on creation and
  replacement; the menu also supplies complete string labels.
- All 15 native catalogs contain the screenshot explanation. French was
  visually inspected in the launcher.
- Region tests cover live dimensions with the loupe present, physical DPI
  dimensions, upper-left placement and the below-crop fallback. Presentation
  reasserts always-on-top without programmatically focusing the controls after
  each edit.
- Focus tests cover stale occlusion recovery, explicitly hidden windows and
  idle focus loss. Focus return requests paint even if visibility did not change;
  popup swapchains also reconfigure when their dimensions remain unchanged.
  The user's prolonged-background freeze was not reproduced
  by the synthetic X11 visibility probe; the resume fix addresses the stale
  presentation state, but does not establish that it was the only cause.
- The private Xwayland server has no X11 window manager. GNOME attention
  notifications and taskbar stacking require a desktop session to verify.
  It also reports no transparent-compositing support, so Beam correctly refuses
  its region overlay; the live-region rules were verified by the targeted model
  tests rather than that graphical probe.
  Windows and macOS native-window behavior were not tested here. The subsequent
  Wayland reproduction is recorded below.

The follow-up X11 attention fix declares region controls, preparation/recording
bars, countdown and selection outlines as skip-taskbar tools. The runtime sets
`_NET_WM_USER_TIME = 0` before the first mapping and each subsequent show, preserving
existing stacking atoms while adding `_NET_WM_STATE_SKIP_TASKBAR`. Winit 0.30's
X11 backend does not implement `WindowAttributes::active`. Removing explicit
focus requests alone therefore did not cover remapping. GNOME's
[attention handler](https://github.com/GNOME/gnome-shell/blob/main/js/ui/windowAttentionHandler.js)
ignores skip-taskbar tools; the
[EWMH mapping contract](https://specifications.freedesktop.org/wm/1.5/ar01s05.html)
defines the zero user time for inactive presentation. Six focused tests passed
on the private X11 server: defaults, initial focus configuration, transparent
backing preservation, passive-but-focusable tools, restored hints with retained
stacking atoms and unchanged ordinary-window policy. This checks real X11
properties and input focus, but does not reproduce a GNOME Shell notification.
The region mask and its two Solid control windows remain separate surfaces.

The automation screenshot adapter is Vulkan llvmpipe, a software CPU device.
Its report distinguishes CPU frame work from OS popup mapping. GPU and CPU
figures from this adapter should not be presented as physical GPU frame times.

## Reproduction and artifacts

Build the automation host with its `automation` feature and bundle the fixture:

```sh
cargo build --manifest-path vendor/argui/apps/gallery/quickjs-host/Cargo.toml --features automation --offline
bun vendor/argui/scripts/build-automation-test.mjs packages/beam-ui packages/beam-ui/test/controls.automation.tsx /tmp/beam-controls-profile/final/bundle
```

Set `ARGUI_AUTOMATION_TEST` to that bundle's `test.mjs`,
`ARGUI_AUTOMATION_ASSETS` to the staged UI's `assets.generated.json`, and
`ARGUI_AUTOMATION_OUT` to an isolated output directory, then run
`argui-gallery-quickjs` from Cargo's configured shared target directory.
The fixture checks repeated Select opening, tab changes, countdown hover,
selection and retained selected duration.

For native X11 probes, use `ARGUI_TEST_BACKEND=x11` with
`vendor/argui/scripts/linux-hidden-display.sh`. A capture probe must also use
`XDG_SESSION_TYPE=x11` for that isolated server; inheriting a Wayland session
would request portal pixels instead. Do not override these variables for the
user's ordinary application launch.

Session artifacts are under `/tmp/beam-controls-profile/`: baseline and final
`report.json` files and PNG captures, native `popup-timings.json` files, isolated
preferences, and renderer timing logs. The final native sequences are
`final/native/` and `final/native-recovery/`. The probes are
`/tmp/beam-native-final-preparation-probe.py` and
`/tmp/beam-native-final-region-probe.py`.


## Select opening animation (2026-09-29)

Both shared Select adapters now use a native 150 ms fade and 0.98 → 1 scale.
Classic menus add a 4 px entry from their trigger; compact item-aligned menus
use no translation. The native layout resolves the anchor pivot and reverses
vertical motion above the trigger. Window extents do not animate. Equivalent
hover / data updates retain the finite timeline's running or finished phase;
closing and remounting starts a fresh entry. Reduced motion opens immediately.

Checks cover initial and repeated entry, immediate selection, keyboard dismissal,
authored opacity, completed-timeline retention, invalid duration / transform input,
above / below placement, hit geometry and native surfaces. A surface that clips
the retained source uses normal repaint instead of a composition patch that would
expose uncached pixels. No JavaScript frame timer drives the animation.

A private X11 probe observed two Beam microphone menus map in 39.46 and 36.17 ms
from click. Their client bounds stayed 220 × 182 throughout snapshots at mapping,
30, 90 and 200 ms; screenshots show the fade and settled menu. These timings
measure local map detection, not display latency or frame-rate guarantees.
Solid automation also exercised both menu styles and selecting an option.
Artifacts are under `/tmp/beam-select-opening/`.

Focused Rust tests, the Select adapter tests, TypeScript checking and library
Clippy were used; no complete test or coverage run was performed. macOS and
Windows were not available. The seven missing desktop-appearance and portal-restore
test mirrors have since been added; the repository mirror check now reports zero
issues. Workspace-wide Cargo formatting is
also blocked by the existing missing Argui `tests/tree/restoration.rs` module;
all Rust files changed for this animation were individually formatted and checked.

## Covered, minimized and restored windows

The native X11 follow-up restored Settings after 20 seconds behind another
window. Settings tab changes remained responsive: 38.63–52.58 ms for Appearance
and 108.44–124.24 ms for Capture. This private Xwayland server has no window
manager, so that sequence did not reproduce actual compositor minimization.

An isolated Mutter Wayland compositor reproduced the reported freeze. Its
controller minimized every test window, waited 20 seconds, then restored only
Settings while Beam's launcher remained minimized. JS click delivery and commits
still arrived, but page content waited until subsequent input. The UI thread
stack was inside `drmSyncobjTimelineWait`, reached through Vulkan Wayland image
acquisition. Pending FIFO image releases blocked the shared UI thread. A redraw
wake timer alone did not resolve this; enabling suspended Winit frame callbacks
also did not recover this reproduction.

Automatic presentation now chooses supported tear-free mailbox for the actual
Wayland backend. Active animations have bounded 60 Hz ticks, with no polling for
idle or explicitly hidden windows. Model-frame invalidation does not bypass the
cadence. Explicit presentation modes remain authoritative. Closing a Wayland
window hides it by minimizing; compositor focus or pointer entry restores the
retained runtime's visibility even if keyboard focus never changed.

The staged-build follow-up passed all six Appearance/Capture changes: initially,
after minimizing everything and restoring Settings alone, and after closing and
restoring Settings. Matching-window queued-commit-to-render measurements were
3.200–4.951 ms. End-to-end page-content detection through the private PipeWire
capture was 414.95–654.06 ms, and initial Settings mapping was 922.90 ms. These
different measurements must not be reported as equivalent: the capture includes
input delivery, compositor and capture-pipeline scheduling. This proves the
reproduced indefinite freeze is resolved, not an instantaneous-display guarantee.
The warmup sequence has also been corrected: Settings warms first, unsupported
topmost tools are skipped, and a failed auxiliary scene does not block later
warmup. That policy has six focused tests with 100% measured coverage.
An additional stationary-pointer check confirmed that the old sidebar selection
clears and the new selection settles without another input event. Hover uses its
own color; moving the pointer away exposes the selected accent. A first
page-content capture can precede the completed sidebar transition.

Transparent-output GPU readback checks verify that partially covered grey corner
pixels retain the authored border color and that the panel, border and shadow
share opacity at 0, 0.25, 0.5, 0.8 and 1. First-popup mapping waits for GPU readiness
outside the UI thread. Five focused GPU checks and 18 presentation/visibility
checks passed. No workspace-wide test or coverage run was performed.

Artifacts are under `/tmp/beam-complexity-fix/`: `wayland-thread-trace/threads.txt`,
`wayland-staged-final/`, `wayland-restoration-final/`, `idle-after/` and
`warmup-coverage/`; the stationary-pointer check is in
`wayland-selection-stationary-final/`. The staged UI emitted no unsupported
window-stacking error. The native Wayland probe used a frozen binary with SHA-256
`233f400fc2945e89fc6a914f297250a804572c7a52bec0a7608aae09b8efab04`.

## Managed X11 activation and presentation

The ordinary native launch selects X11 when `DISPLAY` is set, even inside a
Wayland desktop session. The previous pure-Wayland check therefore did not cover
that launch path. This follow-up used a private Mutter 50.5 compositor with its
managed Xwayland server, rather than the earlier rootful Xwayland without a WM.
Settings completely covered the launcher throughout the interaction checks.

Automatic presentation now prefers supported Mailbox for both X11 main surfaces
and native popup renderers. Active Linux animations have independent bounded
frame deadlines even when Mailbox is unavailable; hidden and idle windows do
not gain a polling timer. Explicit presentation modes remain unchanged.

Group activation includes requested-open windows even when minimized, excluding
closed and prewarmed hidden scenes. Already-visible X11 peers are only restacked.
Minimized peers use the WM restoration request followed by reactivation of the
chosen source. Mapping alone did not restore this WM's minimized clients, while
unconditionally calling Winit's `set_minimized(false)` on visible peers caused a
focus loop. A short minimization guard excludes the WM's automatic focus fallback;
an explicitly restored source is permitted immediately.

The private WM check passed restoring Settings after all windows had been
minimized for 20 seconds, restoring the group from the recorder, preserving the
chosen focus, minimizing Settings alone without undoing it, and keeping closed
Settings hidden on subsequent recorder activation. Both Select openings and all
four Appearance/Capture changes displayed their updated content.

The baseline covered-X11 sample had a mean native render time of 12.657 ms and
p95 of 21.133 ms. The corrected group/presentation sample measured 2.241 ms mean
and 5.636 ms p95. Matching-window queued-commit-to-first-render measurements for
page changes were 4.171–21.890 ms; Select opening measured 30.940 ms initially and
21.141 ms when reused. Page-content detection through the private input/capture
pipeline was 477.41–655.53 ms and is a separate measurement. The initial mapping
value in this probe includes deliberate arranging/settling waits and must not be
used as a startup latency result.

The exact repeated 989–1000 ms interaction peak from the user's log was not
reproduced in this managed-X11 scenario. Idle frame-interval percentiles alone
are not interaction latency. Debug/dev-metrics builds accept
`BEAM_NATIVE_TRACE_COMMITS=1` to log the owning window's
`queued_commit_to_ack_ms`, invalidation kind and changed-node count, allowing
queue/commit delay to be distinguished from presentation delay if it recurs.
This diagnostic does not include input delivery or physical monitor latency.

Artifacts are under `/tmp/beam-complexity-fix/x11-wm-restore/`, with baseline
samples in `x11-occlusion-trace/` and `x11-select-trace/`. The native group
probe is `/tmp/beam-x11-group-probe.py`. No compilation ran alongside these
GUI measurements. Native Wayland does not offer this independent stacking
operation; its earlier compositor-restoration policy remains authoritative.
macOS and Windows window restoration were not available for GUI verification.

The final staged binary and freshly rebuilt adjacent bundles also passed the
full managed-X11 group sequence using the installed runtime, without bundle
path overrides. Page queued-commit-to-render samples were 4.708–8.110 ms;
Select opening measured 67.295 ms initially and 11.750 ms when reused.
This run's capture detection was 543.71–1508.64 ms, so the full input-to-capture
path remains variable despite short native commit/render samples. Its render
mean was 2.717 ms, with p95 6.178 ms. These are separate runs, not a guarantee
that every user interaction displays within one frame.

The same staged binary passed all six page changes in the native Wayland
regression: initial display, restoring Settings alone after 20 seconds with
everything minimized, and closing/restoring Settings. Beam's main window stayed
minimized in the Wayland-only return, as required by that backend's activation
policy. Staged artifacts are in `x11-staged-final/` and
`wayland-linux-pacing-final/`. The staged native binary's SHA-256 is
`31fb1105cafb8ecbf70f77c732e181cdad2521a25acbfdbef9c6c347558a7b44`.

The final focused Nextest run passed 24 runtime checks (animation pacing,
visibility recovery and activation ordering/guards) and all three Beam window
activation checks. The Rust mirror check reported zero issues across 256 source
files. Rust formatting was checked for the changed files, and library Clippy
passed for Argui platform/runtime and Beam native with warnings denied. No
workspace-wide test or coverage run was performed.
