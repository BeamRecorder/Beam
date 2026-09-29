# Changelog

User-facing changes to Beam are documented in this file.

## [Unreleased]

### Added

- Finishing a recording now shows an always-on-top loading window with an animated Beam mascot and a cancel control. The HUD groups current errors and Linux interaction access in a scrollable, copyable warning popover; Settings has a dedicated Linux access page.
- The native launcher now opens a rounded Projects window with recent video projects in a responsive thumbnail grid, immediate name search, and direct reopening in the editor. Recordings without saved artwork get a frame thumbnail automatically.
- Native error messages now include a shared copy button with translated clipboard feedback, preserving the complete diagnostic.
- Media imports can run as cancellable jobs, with one atomic timeline publication and recovery of accepted results after an interrupted owner.
- Native editor documents preserve independently ordered track and sequence effect stacks, with absolute-time curves, presets and undo history.
- Source analysis and hardware proxy jobs keep immutable media provenance, durable status and bounded JSON/video artifact resources independently of the montage.
- Native media can be relinked to a verified source version for explicitly selected clips, with undo and retries after reopening.
- Native projects can reclaim unreachable decision blocks while preserving current content, history, recovery checkpoints and durable render snapshots.
- Native renders run as identifiable jobs pinned to a sequence and revision, with durable status, cancellation and bounded PNG/video artifact resources.

- Native editing exposes a shared local API, generated TypeScript SDK, CLI and MCP adapter with revision checks, atomic batches, dry runs and authorized media destinations.
- Native clips support independently named and ordered effect instances, typed keyframes, source/clip/sequence time references, real two-input crossfades and wipes, and shader-based extension definitions.
- Native timelines support linked audio/video edits, selection and mapped copy/paste, sequence duplication and a separate project history that can restore deleted sequences.
- Recording cursor styles and zoom defaults can be inherited from a sequence or overridden per clip; captures identify separate, embedded, absent and unknown cursor modes explicitly.
- Native video projects now support independent timeline sequences with their own tracks and undo/redo history, using shared source media.
- Timeline clips show visible video filmstrips and Blick audio waveforms with shared, bounded caches and cancellable source-range decoding.
- Native editing now supports generated text titles, image imports, and bounded audio/video fades with saved undo/redo history.
- Microphone and system-audio controls now show real native audio levels as a green-to-red gradient behind their icons, including during recording. Disabled microphone, system audio and camera controls show red crossed-out icons.
- The native region selector includes a precision magnifier of real screen pixels, including Wayland with initial screen authorization, desktop coordinates and pixel-snapped corner resizing.
- Added a native, Concat-inspired video editor with a media library, composed preview, contextual controls and a multi-lane timeline. Import video/audio, trim, split, move, mix audio, adjust framing and color, and export MP4 or WebM through GStreamer Editing Services.
- Native video projects save non-destructive edits and undo/redo history atomically, with exclusive project locking and recovery checkpoints. Beam's recorded click zooms, cursor follow and camera springs now run in Rust and share the preview/export composition.
- Native Beam now supports the existing 15 interface languages through ARGUI i18n, automatically following the system language until a language is chosen in Appearance, with immediate updates across its windows.

- About now checks GitHub releases through ARGUI's native updater, with cancellable downloads, package verification and explicit installation; release CI publishes the update feed and complete application packages.
- Added a native teleprompter and a window picker with real thumbnails, foreground preview, and a selection outline.
- Added a native ARGUI capture launcher with recorder, screenshot, and instant modes, device selection, a region picker, countdown, compact recording controls, tray behavior, and a separate settings window. Completed video captures open in the native editor.
- The native launcher remembers its size, position, shortcuts, and selected devices in Beam preferences.
- Added a developer-only Argui native window linked to a pinned source checkout, so Beam can rebuild local Argui fixes without waiting for a crates.io release.
- Added a directly callable native media engine for screen, camera, microphone and system audio, with a shared timeline, pause/resume, previews, meters, screenshots and an autonomous example that runs without ARGUI.
- Added a native media prototype CLI that records a camera, microphone, and system audio as separate tracks with a shared timeline, a session manifest, bounded measurements including camera-to-GPU submission latency, and a live wgpu camera preview.
- Linux system-audio discovery now lists individual PipeWire output devices and lets recordings select one explicitly.
- Native media sessions now expose shared audio and camera source contracts across Linux, macOS, and Windows.
- The native media report now includes observed wgpu allocation memory when the GPU backend provides it.
- The native media probe can deliberately slow camera preview with `--preview-delay-ms` and reports preview CPU buffer growth, making it possible to check that recording stays independent of a slow preview.
- Native media reports now show preview color conversion, CPU row padding copies, and GPU upload bytes per uploaded frame.
- Native media process samples now include the cumulative preview frame count, allowing frame rate and resource use to be compared throughout a recording.
- Native media reports now show the longest session poll and resource sample times to help diagnose recording stalls.
- Linux system-audio capture now carries valid PipeWire buffer timestamps into the shared audio packet when the server provides them, enabling drift measurements for supported outputs.

### Changed

- The native launcher and video editor run exclusively through Argui. Screenshot captures stay saved; native screenshot editing reports that it is unavailable instead of launching Electron.
- V1 scalar adjustments migrate to editable effect instances while preserving their rendered values and undo history.
- Accepted SDK, CLI and MCP edits refresh native editor panels without idle polling.
- Native history retains up to 50 states within a 256 MiB budget for historical decisions, independently of the current montage's size.
- Native exports acquire source graphs in bounded windows while writing one continuous hardware-encoded output.
- Native preview acquires media for the active playback window, retaining the accepted frame during parameter updates and preparation of another window.
- Native project decisions use immutable content-addressed blocks with paged clip storage, preserving source telemetry outside edit history.
- The native editor uses GPU decoding where supported, GPU composition and camera/color effects, and explicit hardware video encoding. Linux preview shares GStreamer frames with Argui through DMA-BUF, and VA export shares GPU NV12 planes without CPU pixel copies. Argui exposes a common external-frame API with Vulkan, Metal/IOSurface and Direct3D shared texture imports. Export preserves full canvas dimensions.

- Activating a native Beam window restores its other open windows together on X11, while keeping the chosen window focused and leaving closed windows hidden.

- Both native Select styles now open with a brief fade and subtle scale animation; classic menus also slide from the trigger while compact menus preserve the selected row's alignment.

- The native teleprompter now uses a blurred floating toolbar with live speed/font sliders, a full color picker, window opacity and scrolling preview. Settings persist and speed/font changes preserve reading progress.

- Completed native video recordings now open directly in the native editor. The launcher also opens an empty editor for standalone video editing; screenshots remain saved while their native editor is unavailable.
- Native microphone menus now use the desktop audio server on Linux, with hardware-only ALSA fallback; system audio uses the same On/Off choices as the editor.
- Native text uses a slightly stronger default weight and system font fallbacks for additional writing systems.

- Beam now uses Hanken Grotesk throughout its interface and Concat's light/dark surface and text colors, retaining its orange accent.
- Capture mode tabs now sit centered above the source cards, with roomier animated items; settings icon tiles use centered, slightly thicker white vectors.
- Native settings now use compact label/control rows, solid icon tiles, direct shortcut capture with keyboard caps and automatic saving, and an About page with copied system information.

- Capture starts directly from the Full screen, Region, or Window card. The rounded launcher resizes between 440 × 208 and 680 × 252, adapting mode labels to icons; refresh happens automatically.
- The native launcher now defaults to 680 × 252 with compact capture cards, icon-only device fields, and animated mode tabs. Select menus have bounded widths, visible borders, shadows, SVG selection marks, and native hover scrolling for long labels.
- Reduced the countdown and recording bar to their essential controls, and removed shortcut and zoom hints from the launcher.
- Cancelled native recordings retain their interrupted manifest and recoverable media instead of deleting captured files.

- Studio now records through one native engine with separate editable video/audio tracks and a bundled private media runtime; Chromium Studio recorders and the former capture engine are removed.
- macOS recordings now require macOS 14.2 or later for native system audio.

- The Windows native camera prototype now uses a direct asynchronous Media Foundation reader with bounded frame delivery and cancelable shutdown.
- The macOS native camera prototype now captures through AVFoundation with late-frame discard and bounded callback queues.

### Fixed

- Linux native development builds now find a persistent, version-matched local GES SDK when the system development package is absent, avoiding linker failures after a temporary SDK is removed.
- Native Beam starts again when a previously saved HUD size falls outside the current launcher bounds; it restores the default size while retaining the other preferences.
- Completed recordings wait for the editor to load before Beam considers it open, and editor startup failures report their actual diagnostic. Installed Linux interaction access reconnects automatically on launch, while Settings shows its current state instead of asking to allow it again.
- Recorded clips now open when the encoded media ends before the capture clock, and Linux previews select the GLES shader path consistently.
- Native recording controls now show only discard, restart, pause/resume, a larger Stop button and a vertically centered timer. Restart erases the current take and records again from zero; empty areas let you drag the bar.
- Recorded video previews remain available when separate cursor positions are missing, with a warning instead of a failed preview. The recording clock updates from live native duration and resumes when its window becomes visible.

- Confirmed regions keep their dimming mask visible with mouse passthrough during countdown and recording, closing it on stop or cancellation. Countdown and default bottom-centered recording controls use the crop's display, including mixed DPI.
- The recording timer follows native session duration through pauses, window resizing and hiding. User-moved control positions are saved before hiding; obsolete monitor positions return to the default placement.
- Native development builds prepare isolated UI bundles, preventing missing editor files when another build refreshes the UI output during Rust compilation.
- Region dimensions use compact pills that follow the selected light or dark theme during dragging and after selection. Changing crop presets updates retained controls without replaying their entrance animation.
- Fixed translucent rendering artifacts in region selection and the teleprompter when separate parts of a surface update. The teleprompter now follows the selected theme, with automatic text contrast and preserved custom colors.
- Linux Region selection now distinguishes the authorized stream's pixel resolution from Wayland/XWayland desktop geometry, selects the granted monitor, and keeps the magnifier, dimensions and crop presets aligned at different display scales.
- Copied native text remains available on Linux desktops without a clipboard manager while Beam is running.
- Native Linux controls and Select menus now advance active animations with independent frame deadlines; X11 and popup surfaces use supported Mailbox presentation so covered windows do not hold up other windows.

- Native editor toolbar icons stay centered, sequence tabs align left, and library tabs adapt during panel dragging. Delayed library hints appear only in icon-only mode; tooltip bubbles fit short labels and wrap longer text within a maximum width.
- Native editor edits keep the project title, preview and inspector stable without temporarily disabling every control. Undo/Redo use plain toolbar buttons, and narrow property fields keep their Select arrows visible.
- Native editor tabs reuse the recorder's animated segmented control. Narrow library tabs show icons with delayed tooltips, and compact preview selectors open readable menus.
- Native windows resume updates after minimizing, closing and restoring them under Wayland, including when only Settings returns. Settings preloads independently of unsupported capture-window stacking.
- Transparent native window corners retain their border color, and Select menus wait for their first GPU frame and fade their panel, border and shadow together.
- Native capture preparation can cancel cleanly at every asynchronous step, starts immediately when countdown is disabled, and always releases stopped or failed scene actors.

- Native timeline effect regions mount reliably after loading media and keep their controls when project metadata refreshes.
- Native editor source thumbnails and waveforms use GPU canvases registered before launch, preserving live preview, pointer controls and responsive tabs after media loads.
- Native editor category tabs keep labels aligned in wide panes, switch to centered icons with delayed hover hints in narrow panes, and clear hints when labels return.
- Native editor refreshes the preview after overlapping startup requests without adding idle polling.
- Native projects reopen safely after an interrupted API owner, renewing their private access token while preserving an active owner.

- Duplicated sequences keep independent track and sequence effect identities and animation keys.
- Native projects open correctly from long directory paths using a private local owner endpoint.
- Native seeks wait for their own media segment and completed viewport delivery, correctly reach positions beyond the first timeline cut, and external previews retain the producer of each displayed frame.
- Failed media imports remove their unpublished managed copies and preserve the accepted project.
- Native inspectors reject stale clip details and refresh when another client has edited the project.
- The first V1 project checkpoint remains available after migration and later edits.
- Transition keyframes use the transition's own clock, and command receipts identify new animation keys without loading the entire timeline.
- Native titles use the canvas dimensions for text positioning, keeping titles visible at their requested location.
- Native editor panels adapt to smaller windows. Resize handles show small centered orange pills only on hover; the native engine resizes panes directly and sends JavaScript the final size once on release.
- X11 region controls and capture bars now declare inactive presentation and stay out of the taskbar, preventing GNOME's repeated “window is ready” notifications while retaining always-on-top stacking and keyboard interaction.
- Native Select menus reuse their GPU renderer and load only the assets they display, reducing reopening latency. The first capture-mode tab change now animates, and returning focus resumes suspended native presentation.
- Screenshot mode explains why camera and audio controls are absent in all 15 interface languages. Region dimensions remain visible while dragging, and its preparation controls restore their always-on-top level without requesting focus after every crop.
- Fixed the preparation bar's countdown submenu failing on numeric labels; inline numeric text is now converted safely before reaching the native renderer.
- The native editor keeps Beam's existing orange action and focus colors with its Concat-style surfaces.
- The native teleprompter keeps only its four live adjustments and Play/Pause in one floating row, with direct editing when stopped and native resize bounds from 320×180 to 1600×1000. Its color picker avoids repeated layout and script scans while dragging, renders clean corner colors, removes redundant percentages, and puts the scrollbar against the popover edge.
- The launcher's device selectors align with the top of the capture-mode tabs, and the Teleprompter button aligns with the bottom of the capture cards; both columns remain centered while resizing.
- Native layouts follow resize events without stale geometry reads or lingering animated sizes, and a timed-out frame retries without waiting for another click. Window geometry saves after resizing settles, and live audio meters no longer trigger layout work for each level change.
- Fixed invalid zero-duration native transitions at startup and on pause; long teleprompter scripts retain their selected speed through bounded scrolling segments.
- Native screen recordings retain sharper text and fine detail with explicit recording quality and hardware VP9 on supported GPUs, while preserving source dimensions and reporting the actual codec.
- The native editor now follows the Concat reference more closely, with resizable panes, a timeline that fills its pane, real source thumbnails, wider contextual controls, and full-resolution preview by default.
- Region dimensions are read-only text beside an expanded preset Select, aligned to the crop's upper left and placed below when needed. Its preparation bar shares camera, microphone and system-audio selectors with the launcher, with Cancel at the left, Record at the right and consistent corner radii. Native corner/edge cursors support resizing.
- Fixed the precision loupe's cursor/DPI alignment on native capture backends. Wayland authorizes real pixels when Region opens and reuses the screen grant for recording when the portal supports it, without invoking the Screenshot portal's sound/flash.
- Fixed native region-bar clicks being routed to the preset window, retained live audio levels, and Cancel handling. Region, full-screen and window capture now share the same preparation controls, bottom-centered by default with saved user moves.
- Audio-meter gradients are transparent and subtle, with fast response, brief interpolation and immediate silence clearing instead of delayed activity or a permanent green level.
- Preparation controls include countdown quick settings and supported desktop/taskbar hiding, restoring the desktop after cancellation or recording failure. Unavailable desktop options are shown explicitly.
- Countdown and recording controls reassert their X11 always-on-top level. The recording bar starts at the bottom center and remembers user moves; auxiliary windows restore their saved desktop positions. Countdown shortcut hints appear below Cancel, matching the existing frontend.
- Finishing a native recording opens only its video editor without showing the capture launcher again.

- Native GPU exports preserve color by using the same BT.709 conversion and encoder metadata.

- Native Shadcn select menus follow their button width when resized, with opaque themed borders and smooth corner coverage.

- Small toolbar icons now use even pixel sizes to keep their centers aligned with their buttons.

- Native capture selectors use the gallery's fruit-select placement, keeping the selected option aligned with its button rather than opening a menu below the pointer.
- Select menus preserve their panel width and shadow; long option labels scroll slowly on hover and reset when the pointer leaves.
- Legacy disabled device preferences are normalized, and unavailable saved devices no longer appear silently disabled while remaining selected for capture.

- Removed the dark rim around native window corners and stale hover highlights in select menus.
- Fixed unequal active-tab insets and vertically misaligned select labels; native buttons now keep icon and text content centered without excessive vertical padding.
- Fixed duplicate native device-option IDs when the source catalog refreshes while a select menu is open.
- Rebuilt region selection from ARGUI's native screen spotlight: draw, move by the border, resize by corners, and select presets with separate crop controls. The X11 crop interior forwards mouse clicks to the app underneath.
- Fixed faint native window borders, capture-card aspect ratios, mode-tab sizing, and long device-menu placement. Theme changes now update hidden and visible windows immediately; interface zoom is disabled.
- Reduced transparent-window resize flashes by preserving X11 backing contents and presenting valid swapchain frames before reconfiguration.
- Linux Wayland now uses the system window chooser; Linux X11, macOS and Windows retain Beam's window picker. Closed or replaced picker sessions cannot reopen stale previews.

- Fixed native startup losing the theme context when linked workspace dependencies bundled multiple copies of SolidJS and the ARGUI Solid adapter.
- Fixed native startup errors from conflicting ARGUI patches and missing QuickJS globals. Native preferences and teleprompter documents now share validated, atomic JSON storage.
- Reset saved window sizes from earlier native launcher layouts to the compact 680 × 252 default once; subsequent manual resizes remain saved.
- Fixed native region dragging and auxiliary button input. Settings now reopen in a retained native window without launching another process, and auxiliary Solid scenes mount on demand.
- Region selection, the countdown, and recording controls now open in their own native ARGUI windows while the HUD keeps its original bounds and position. The launcher and settings use custom window controls, region dragging follows the pointer, and auxiliary windows load when needed so the HUD appears sooner. The native development launcher can also rebuild while an earlier instance remains open.
- Fixed native development startup so `beam:native` loads its staged ARGUI bundle, and made `electron:dev` report a missing Electron installation before compiling Rust.
- Linux screen and system-audio capture now finish their output workers when a PipeWire worker panics, avoiding a stuck stop operation.
- Linux screen capture now reports the PipeWire worker failure that interrupted preparation instead of labeling every early exit as a negotiation timeout.
- Capture probe commands now reject unknown commands and missing format source IDs before attempting device discovery; Linux native probes no longer require an unrelated catalog scan.
- Native camera access failures now report permission denial separately from a missing device on Linux, macOS, and Windows.
- The native macOS probe now embeds camera, microphone, and system-audio privacy descriptions so its standalone executable can request capture access.
- Checked macOS camera buffer bounds before copying frames and preserved the first Windows camera capture error for clearer failure reporting.
- Recovery keeps an explicitly incomplete session incomplete even when its final manifest file exists.
- Older capture catalog snapshots now load with newer capability flags defaulting to unavailable.
- The native media probe rejects extra arguments for `devices` and help before opening any devices.
- Native media recording now drains queued camera and audio packets after stopping capture, preserving the end of each track.
- Native media recording now reports a stalled encoder at stop instead of waiting indefinitely for its worker.
- Native media sessions now mark a track with no accepted media packets as interrupted, including when audio packets were received but every writer submission was dropped.
- The native media probe now writes a failed camera track and session manifest when no camera is available.
- Native device discovery now lists available audio devices even when camera permission is denied, with separate errors for each device category.
- Native macOS system-audio capture now uses a private Core Audio tap for duplex outputs so the output track does not accidentally record the device microphone.
- macOS system-audio tap errors now distinguish denied capture permission and a missing output device from other Core Audio failures.
- Native camera and Linux system-audio shutdown now retain stalled workers for a later stop attempt instead of losing their join handles on timeout.
- Native microphone capture now fails clearly when a device produces audio faster than real time, and fatal capture errors reach the session even when drop metrics saturate their event queue.
- Native camera disconnect and failure events now reach the session even when dropped-frame notifications fill their event queue.
- Native Linux system-audio failures now reach the session even when PipeWire drop notifications fill their event queue.
- A recording tied to a specific Linux PipeWire output now becomes interrupted when that output disappears, instead of completing after an unnoticed route change.
- The native camera preview now submits GPU uploads so long recordings do not accumulate staging memory, and preserves preview metrics if a GPU error occurs.
- Native media stop now finishes promptly when a capture source keeps reporting queued data that cannot be read, marking that track interrupted while finalizing unaffected tracks.
- Native media stop now preserves completed track files and publishes an incomplete manifest with a warning when saving measurements fails; failed atomic publication also removes its temporary file.
- A failed periodic native-media checkpoint now leaves its cause in an incomplete final manifest even when the checkpoint path cannot be removed.
- Native media drift reports now use the first available native timestamp and suppress a drift value after a clock discontinuity, while preserving the raw timing points.

## [0.3.3] - 2026-09-21

### Fixed

- Studio now opens its editor shell without waiting for the first camera preview frame, avoiding a startup timeout when camera decoding is slow.
- Video and webcam timeline thumbnails now follow zoom smoothly and refine to display-sized images with a fade instead of stretching a low-resolution preview.

## [0.3.2] - 2026-09-21

### Added

- Screenshot editor now has a fullscreen preview button beside the canvas dimensions control, with a Back button and Escape to return.

### Changed

- New arrows in Screenshot and Studio start smaller and thinner while existing arrows keep their saved appearance.
- Studio's Remove gap now closes a truly empty interval across all tracks and zooms together; it is unavailable when media overlaps the interval.
- Linked clips in the Studio timeline show a link marker and identify their companions on hover.
- The linked-clip deletion dialog now has a dedicated video, image, and audio preview player with clip-range seeking, real media thumbnails, animated selection, and a scrollable clip list.
- Audio previews in the linked-clip dialog now show Beam's WebGL waveform in a moderately zoomed, scrolling view with live playback progress and click-to-seek.

### Fixed

- Editor startup failures now show a clearer reason and the last confirmed loading step; copied diagnostics include the failure code and time spent on that step.
- Opening Studio after longer recordings no longer deeply observes the full cursor and input event history during editor startup.
- Splitting or holding a recording now keeps microphone and other sidecar links attached to the matching screen fragment, including when reopening older edited projects.
- Audio previews now play with sound even when the audio clip shares a video file with its linked clip.
- Outline-only shapes, including speech bubbles, now cast a shadow when Fill Color is off and a border is present.
- Resized Screenshot images now use high-quality interpolation in preview and export.
- Imported and pasted Screenshot images now retain their available native resolution, including HiDPI clipboard variants, and preview at display-matched pixel density instead of a fixed low-resolution cap.
- Screenshot compositions now save, copy, and export after deleting the captured image, background, or watermark layer.

## [0.3.1] - 2026-09-20

### Fixed

- Fixed older Studio projects failing to reopen when a recoverable screen recording used the legacy `screen/primary` media path.

## [0.3.0] - 2026-09-20

### Added

- Added English guides for Instant, Studio, and Screenshot capture modes, including cropping, composition, clipboard, and export workflows.
- Added one-click Studio canvas screenshots with a three-second shortcut to open each capture in a new Screenshot editor window.
- Added reusable solid-color and saved-gradient controls for shapes and freehand drawings.
- Added multi-item copy, cut, and paste shortcuts with localized feedback in the Studio and Screenshot editors.
- Added direct clipboard-image paste into Screenshot compositions and Studio tracks, double-click crop, and on-canvas rotation handles for elements.
- Added right-drag box selection and Ctrl/Cmd/Shift-click toggling on Screenshot and Studio canvases, including additive drags from existing selection handles, for multi-item copy, cut, and delete workflows.
- Added group dragging for multi-selected items in both Screenshot and Studio without collapsing the selection, with alignment guides for the moved group.
- Added a shared searchable library of 94 previewable vector shapes to the Studio and Screenshot editors, including all 72 shapes from the imported gallery pack.

### Changed

- The Elements toolbar now adds an outlined rectangle immediately from “Shape”; the selected element’s properties open the full library when another shape is needed.
- The homepage now presents a full-size Explore features gallery synchronized with the hero across Instant, Studio, and Screenshot copy, colors, and mode-specific media.
- The website hero now switches smoothly between Instant, Studio, and Screenshot messaging, brings the product forward inside a real MacBook frame, and uses subtly animated, soft-edged sparkles with ordered dithering.
- The homepage capture-mode cards now stand on their own with aligned content, while each detailed mode section uses its own colored icon badge.
- Redesigned the Beam homepage around its three capture workflows with accurate local-first clipboard behavior and product demonstrations.
- Property-panel delete footers now blend into the shared, symmetrical scroll shadow without an extra top border.
- Screenshot layers can now be reordered by dragging the layer row directly, without a separate drag handle.
- Screenshot editing now opens on Elements, and new annotation shapes start as unfilled outlined rectangles.
- Crop measurements and confirmation now stay together in a compact floating HUD outside the selected media.
- Copy and paste feedback in Screenshot and Studio now includes a visual thumbnail of the affected element.
- Screenshot source, background, and watermark layers can now be copied or cut into editable image layers, deleted like other unlocked layers, and restored by using their controls again.

### Fixed

- Fixed Manual Zoom placement so the crosshair tool exits after positioning the zoom target on the canvas.
- Fixed tooltip-backed options in segmented button groups so custom-setting buttons no longer collapse into a narrow stray segment.
- Fixed double-click crop so the primary screen recording can enter crop mode in Studio.
- Fixed Studio and Screenshot paste shortcuts so a freshly copied Beam element wins over a stale system-clipboard image.
- Fixed KDE/Wayland cursor metadata and pointer-motion capture for touchpads and absolute pointing devices.
- Fixed Windows cursor coordinates when display scaling is above 100%.
- Improved editor startup timeout diagnostics with copyable technical details.
- Fixed shape and drawing fill and border controls so each property updates the correct style, including immediately after creating a drawing.
- Fixed pasted Studio selections so every selected clip, caption layer, and zoom is recreated instead of only showing paste feedback.
- Corrected the Vietnamese folder reveal action to “Mở thư mục”.
- Fixed long toast actions so their labels wrap below the message instead of overlapping capture feedback.

## [0.2.9] - 2026-09-13

### Added

- Added Quick Snip, shared Studio and Screenshot editing tools, and protected Linux interaction capture.

### Changed

- Clarified HUD capture modes and limited presets to the modes where they apply.

### Fixed

- Fixed physical Windows cursor coordinates and sized Windows encoders from the frames received by the capture engine.

## [0.2.7] - 2026-09-06

### Added

- Added precise crop controls, committed undo history, recording shortcuts in the countdown, and improved timeline selection and locking.

### Fixed

- Fixed KWin PipeWire buffer negotiation, camera device reliability, crop placement, accidental HUD browser zoom, and macOS system surfaces appearing in the window picker.

## [0.2.6] - 2026-08-31

### Added

- Added voiceover recording and audio normalization.

### Fixed

- Improved the editor workflow and native recording startup reliability, including Linux capture startup.

[Unreleased]: https://github.com/BeamRecorder/Beam/compare/0.3.3...HEAD
[0.3.3]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.3
[0.3.2]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.2
[0.3.1]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.1
[0.3.0]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.0
[0.2.9]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.9
[0.2.7]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.7
[0.2.6]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.6
