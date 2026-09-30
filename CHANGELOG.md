# Changelog

User-facing changes to Beam are documented in this file.

## [Unreleased]

### Added

- Development Settings now include shortcuts to detached DevTools and a separate Mascot Lab, with adjustable eye size, width, height, spacing and vertical position. Eye proportions are saved with lab presets and included in exports.
- Added a shared screen/window chooser for Windows and macOS with searchable thumbnails, keyboard navigation, live window previews and a click-through selection aura that disappears before countdown. Development launches can supply 3 simulated displays and 21 windows through `DEV_CROSSPLATFORM=1`, including on Linux; normal Linux capture retains the Portal.
- Beamy now appears large and centered during loading with translated tips, then gently moves into the HUD logo. Clicking the brand plays independent selections from twelve mascot morphs and twelve text effects, returning to the original cloud and plain Beam text.
- The recorder shows a lightweight animated cloud while its interface loads, with a retry action if startup fails.
- Instant capture now has a small cloud mascot that accompanies recording, dances and morphs during export, and briefly celebrates completed videos, respecting reduced-motion preferences.
- Region recording now offers a desktop magnifier, live pixel dimensions, Full screen and size presets, teleprompter, device controls and a 0–10 second countdown. Controls hide during dragging and return with a spring animation. Desktop icons and the taskbar/Dock can be hidden from capture on supported platforms.
- Capture problems now appear in the toolbar with a count and a scrollable hover panel, including individual copy actions.
- Settings and Projects now open in separate, resizable desktop windows.

### Changed

- Redesigned Settings with neutral navigation, colored category icons, direction-aware transitions and indexed search across setting names, descriptions and shortcuts in the selected language and English. Search is focused on opening and accepts typing only in the active Settings window. Recorder setup now has a saved Always on top option, with previews for its window, recording bar visibility and Light/Dark/System themes. About features the interactive Beamy identity, clearer version contrast, update controls and the current Discord invitation.
- Preference changes can now be saved together in one batch. Shared JSON storage in Electron and Rust avoids repeated writes, preserves complete existing documents when staging fails, and cleans up owned temporary files after failures.
- Capture mode and Light/Dark/System controls share a sliding selection indicator, with instant updates when reduced motion is enabled.
- Beam's light theme uses a clearer orange with subtle accent fills and borders, correcting its brown appearance on white surfaces; the dark theme and custom colors retain their selected shades.
- Projects opens in a smaller window with square cards that adapt to resizing. Missing thumbnails are generated only for visible projects, one at a time.
- Desktop windows load their selected interface, language and appearance in parallel. Camera and Quick Snip controls load independently of the HUD, and auxiliary startup waits for native capture discovery.
- Recorder startup now loads other languages, recording overlays, font parsing and SVG validation only when needed, and exposes startup timings in developer tools.
- Updated desktop and website JavaScript dependencies to their latest stable versions, including Electron 44, and upgraded Bun to 1.4.2 locally and in CI.
- Recording controls are now a compact horizontal bar with Delete, confirmed Restart, Pause/Resume and Stop. Old bar positions reset once to the bottom center of each display; later moves remain saved.
- Simplified the teleprompter to a larger floating toolbar for speed, text size/color, window transparency, reset and playback, with translated reset confirmation and only a title and Close button above the script.
- Consolidated the desktop HTML entry pages in `html/`, including the recorder, editor and teleprompter.
- The recorder source cards now share the Full screen artwork.
- Redesigned the capture HUD into a compact horizontal layout with Full screen, Region and Window cards that open the matching selection and capture after confirmation.
- Refreshed the default light and dark surfaces, typography and control shapes, with bundled Hanken Grotesk and themed device/preset menus.

### Fixed

- Centered the Beam logo and wordmark vertically in the recorder toolbar, including animated text.
- Editor opening now shows Beamy with a single friendly, translated status, no HUD titlebar, and a Cancel button that safely returns to the recorder without deleting the project.
- Beamy shows a downcast expression with round eyes when editor opening or another Beamy status fails; editor error actions stay accessible with long translations.
- Project playback starts after saved editor settings are restored; audio waveform GPU work runs in a shared worker to keep the editor responsive during loading.
- Saved project thumbnails use the same media protocol as video previews, so development windows display them instead of a broken image.
- macOS window selection excludes privacy indicators and other system UI surfaces while retaining real application windows.
- The first countdown value now waits for its mounted renderer as well as native window readiness, preventing an empty countdown on first use.
- The Beam wordmark stays vertically centered and unclipped at rest; Beamy uses the original rounded Mascot Lab cloud and eases back to it after each interaction.
- Full screen region controls keep a visible margin at the top and bottom, and their placement adapts to translated labels, wrapped controls and device errors.
- The region selector shows the live desktop through its transparent crop instead of covering it with a frozen screenshot; the snapshot is used only by the magnifier.
- Region controls return directly to their final position at screen edges, and the selector loads independently while its native desktop preview prepares.
- Linux region capture chooses a monitor once through the Portal and reuses that authorized source for the magnifier and recording. Accidental clicks no longer create empty crops.
- Windows/macOS HUD popovers temporarily expand the transparent window; Linux menus scroll within compact bounds so added transparent space cannot block desktop clicks.
- Development builds and launches now find native capture binaries in the Cargo-configured build directory, including shared Linux caches.
- Linux now selects X11/XWayland at launch to avoid GPU startup crashes and enable native placement; screen region selection waits for renderer readiness and opens at the exact display bounds.

### Removed

- Removed the standalone Mascot Lab entry from production builds; the lab remains accessible through development Settings.

## [0.4.0] - 2026-09-27

### Added

- Added an adjustable cursor spring when movement stops, enabled by default and saved with editor presets.

### Fixed

- Linux Mint Cinnamon/X11 now explains its missing ScreenCast backend instead of suggesting that installing the XApp portal alone will enable recording.
- Removing a pause gap between recording clips now keeps later cursor movements, clicks, and automatic camera follow in sync with the video in preview and export.
- Prevent Linux window recordings from moving the cursor to the top-left when focus leaves or returns to the shared window or display.
- Keep Linux cursor movement synchronized when compositors such as niri provide a stagnant PipeWire presentation timestamp.
- Screen recording now works on Niri and other Linux compositors that require modifier-backed DMA-BUF capture buffers.
- Linux screen recording now drops malformed DMA-BUF frames without ending capture and refreshes imported buffers after format changes.
- The cursor stop spring now stays sharp while motion blur continues to follow regular cursor movement.
- Typing a Screenshot export width or height with Keep aspect ratio enabled now preserves the starting proportions, so placed elements scale with the captured image.
- Cropping a Studio video now keeps the cursor and click effects aligned with the visible recording in preview and export.
- Instant capture from the HUD now opens on a full display without a Quick Snip window geometry error.
- The floating camera preview now opens in a square shape; previews saved at the former default size adopt the new shape.

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
