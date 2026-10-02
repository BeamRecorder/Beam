# Changelog

User-facing changes to Beam are documented in this file.

## [Unreleased]

### Added

- Create and edit video or image documents through a shared engine API and CLI, with identified JSON transactions, revision conflicts, retry deduplication and undo/redo.
- Packaged CLI launchers use Beam's bundled Electron runtime and support native recording/screenshot commands without a separate Bun or Node installation.
- Render seekable HTML/Vue motion projects through the shared video renderer and encoder, including paused GSAP animations.
- Extract a video frame into an editable image document, then modify layers and export PNG or WebP through the same still renderer as Screenshot.

- Documents support nested scenes with group transforms, opacity, blending, masks and local clocks, plus generic property keyframes editable through shared commands and the CLI.
- CLI export runs in headless Chromium on Linux without an X11 or Wayland display; imported fonts use explicit portable resources.
- A development CLI can inspect, edit and benchmark Beam documents, and export portable render snapshots through an independent Chromium backend without opening the editor.
- Export diagnostics include bounded engine measurements with median/p95 timings for decode, rendering, encoder waits and separate GPU submission/execution stages.
- Double-clicking empty Studio canvas space opens the grouped Add menu, while double-clicking clips still opens text editing or cropping.
- Video editor Accessibility settings can require double-clicks to add zooms, captions and elements from empty timeline tracks, preventing accidental additions.
- Recorder and region settings can record the real system cursor on Windows, macOS and Linux while keeping automatic zooms. These recordings start with Beam's custom cursor overlay disabled; a toggle in the Cursor header can enable it again, and the choice is saved with the project and used for exports.
- Studio and Screenshot share a compact Ctrl+F / Cmd+F Spotlight with grouped Add, Clips, sections, settings and actions. Clips show their project thumbnails; results stay aligned and scroll smoothly, with scroll shadows and mouse Back/Forward navigation.
- Development Settings now include shortcuts to detached DevTools and a separate Mascot Lab, with adjustable eye size, width, height, spacing and vertical position. Eye proportions are saved with lab presets and included in exports.
- Added a shared screen/window chooser for Windows and macOS with searchable thumbnails and keyboard navigation. Development launches can supply 3 simulated displays and 21 windows through `DEV_CROSSPLATFORM=1`, including on Linux; normal Linux capture retains the Portal.
- Beamy appears centered during loading with translated tips, then disappears when the recorder is ready. Clicking the Beam wordmark plays one of twelve text effects before returning to plain text.
- The recorder shows a lightweight animated Beamy while its interface loads, with a retry action if startup fails.
- Instant capture now has a small Beamy mascot that accompanies recording, dances and morphs during export, and briefly celebrates completed videos, respecting reduced-motion preferences.
- Region recording now offers a desktop magnifier, live pixel dimensions, Full screen and size presets, teleprompter, device controls and a 0–10 second countdown. Controls hide during dragging and return with a spring animation. Desktop icons and the taskbar/Dock can be hidden from capture on supported platforms.
- Capture problems now appear in the toolbar with a count and a scrollable hover panel, including individual copy actions.
- Settings and Projects now open in separate, resizable desktop windows.

### Changed

- Preview and export reuse unchanged active clip order and text layout; Studio retains fixed background pixels, and export progress thumbnails convert without pausing video encoding.
- Dense previews evaluate canvas selection geometry only when needed, reuse shape paint styles and skip rectangles fully outside the rendered image during zooms. Preview and export share the same visibility checks without reducing image quality.
- Timeline playback moves the playhead with a composited 3D transform and reuses unchanged visible clip lists instead of repainting static artwork on every tick.
- Desktop application code now lives under `apps/desktop`; reusable document, rendering, encoding, storage and native capture transport code lives in separate packages.
- Timeline artwork shares one viewport-sized canvas and one measurement/paint queue; Ctrl/Cmd-wheel zoom keeps the time beneath the pointer and supports long timelines without a fixed ruler cap.

- Studio preview and export use the same completed-frame renderer for scenes, camera effects, cursor, text and transitions.
- Immutable engine edits and undo/redo share unchanged document records, reducing full-document JSON copies; CLI benchmarks now include editing timings.
- Timeline artwork now uses viewport-sized canvas lanes instead of per-clip DOM artwork, while keeping accessible editing controls and GPU audio waveforms.
- Blur, frost, pixelation and highlight effects share retained GPU filtering in preview and export, with bounded masks and ordered backdrop groups.
- Scrubbing requests preceding keyframes while moving, then refines to the exact image on release or after a short pause. Timeline drag previews retain sparse timing patches, and history/save observers avoid repeated whole-document serialization and deep traversal.
- Dense runs of eligible pixel-aligned opaque rectangles batch on the GPU in preview and export, preserving native video/effect ordering and full-resolution output. Complex and fractional shapes retain their original painter.
- Video-heavy previews and exports batch adaptive shadow color sampling and reuse eligible full-resolution geometric media shadows. Shape effects retain compact blur masks and reusable paths; editor and export teardown releases their GPU surfaces.
- Virtualized timeline lanes, clips, captions, zooms and ruler ticks in both scroll directions; offscreen audio lanes no longer start waveform decoding. Large selections remain available across scrolling.
- Large clipboard selections now paste in one validated transaction. Drag previews avoid repeated deep reactivity scans, and fragment collision limits use indexed lane boundaries.
- Identical video copies share decoded frames in preview and export without merging their visual layers. Full-resolution blurs combine backdrop cropping and filtering, and reuse bounded feathered masks without GPU allocation churn in oversized scenes.
- Shape-heavy Studio projects share identical element thumbnails and reuse timeline metadata and indexed camera lookups to reduce preview, playback and scrubbing work without lowering preview quality.
- Editor settings now use clear categories, consistent option typography and aligned category icons. Update actions sit together with a shorter Changelog label; About groups community links and system information, and developer tools no longer sit inside nested boxes.
- Recorder and editor settings share clearer Light/Dark/System previews, with brighter dark previews and one sliding selection indicator instead of an extra orange checkmark. The redundant language description is removed and Theme replaces Theme Mode.
- Theme Advanced contains colors and style. Scaling keeps the global UI scale visible and puts per-area overrides behind its own Advanced button.
- Recording defaults and region controls share desktop icon and taskbar/Dock visibility switches and the same saved preferences, also used by Quick Snip.
- Advanced panels share smooth opening and closing animations, including quick reversals and reduced-motion support.
- Cursor properties now group appearance, shadow, motion and click effects without repeated dividers. Shadow options appear directly when Drop Shadow is enabled and hide when disabled. Motion details use Advanced, Custom motion opens its sliders automatically, and Screenshot keeps rotation with appearance.
- Element properties now live in Clip in Studio and Screenshot. Each editor keeps a single grouped Add menu with arrow submenus, neutral actions, rounded corners and equal padding.
- Editor sidebars now share the button groups' sliding orange selection animation, including Settings, with immediate positioning during scroll/resize and reduced-motion support.
- 3D zooms offer six compact, outlined tilt previews and show the selected perspective in the timeline. Advanced reveals the sliders, Custom opens them automatically, and a small Info tooltip replaces the long perspective explanation.
- Color pickers now use a compact control row without the redundant large swatch, HEX caption or repeated Color header. HEX/RGB switching and the eyedropper have visible icons, and Escape closes the popover from its controls.
- Buttons and custom selects keep neutral hover and open states. Button groups offer orange or neutral selections with clearer light-theme contrast; preview eyes appear only in menus that offer a visible preview.
- Watermark text/position and text alignment button groups now use the Recorder's sliding selection animation.
- Undo/redo feedback identifies the action and affected item, including reopened Screenshot history.
- New editor and recording controls, Spotlight labels, undo/redo descriptions and contextual help are translated into all 15 supported languages.
- The Recorder and editors use one shared light/dark palette with a livelier Beam orange and white action labels and icons, including saved orange appearances with custom corner radii.
- Editor titlebars now center a borderless project switcher with a wider rectangular project panel, place presets on the left with a settings icon, and shorten video export labels in all 15 languages. Export buttons fit their labels.
- Capture modes now use Beam’s original Recorder, Screenshot and Instant SVG icons in the HUD, Quick Snip controls and project pickers.
- Simplified the editor with Concat-inspired light/dark surfaces, neutral controls, taller sliders with rounded handles and compact value editors, a softer orange accent, aligned sidebar buttons and subtle properties-panel opening animations. Slider focus outlines appear with keyboard navigation.
- Background imports now occupy the first library tile. Image, video, color and gradient tiles share their dimensions, with translated addition tooltips in all 15 languages.
- Zoom and caption tracks are larger; audio tracks are shorter. Timeline items share neutral selection, hover and disabled states, with quieter lane backgrounds and clearer colored blocks and waveforms in both themes.
- Beamy now uses Bloub’s original circular body, rounded capsule eyes and neutral/sad/happy expressions in Beam’s theme color, without cloud styling or cheeks. Sad states blink and move their gaze naturally.
- Startup immediately shows compact animated loading dots. After three seconds, Beamy briefly morphs into a triangle before returning to the dancing dots, using the shared Mascot Lab engine.
- Projects and Preferences now use smaller muted gray titlebar icons and lighter titles. Preferences matches the recorder’s compact 38 px titlebar height, including native window controls.
- Titlebars use the fixed Beam logo for the recorder, the existing folder icon for Projects and the gear icon for Preferences. The text-only Beam easter egg remains available, including in About. Beamy is reserved for loading and status states.
- Redesigned Settings with neutral navigation, colored category icons, direction-aware transitions and indexed search across setting names, descriptions and shortcuts in the selected language and English. Search is focused on opening and accepts typing only in the active Settings window. Recorder setup now has a saved Always on top option, with previews for its window, recording bar visibility and Light/Dark/System themes. About features the interactive Beam wordmark, clearer version contrast, update controls and the current Discord invitation.
- Preference changes can now be saved together in one batch. Shared JSON storage in Electron and Rust avoids repeated writes, preserves complete existing documents when staging fails, and cleans up owned temporary files after failures.
- Projects now uses Beam’s compact titlebar with only Close and no oversized navigation footer. Ctrl+W (Cmd+W on macOS) closes the window, clicking a project title renames it, and typing anywhere on the page starts searching immediately. Project titles stay left-aligned.
- Simplified source selection into a centered transparent Alt-Tab-style overlay with a compact search header, thumbnail row and scroll fades, without shadows, glow or footer. Hover shows the source behind the selector; clicking or pressing Enter starts the configured countdown immediately, or recording directly at 0 seconds.
- The countdown now has a Cancel button translated into all 15 supported languages, which releases the prepared recording without starting capture.
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

- Canvas horizontal mouse-wheel scrolling now zooms in and out according to its direction instead of always zooming out; zero-motion events no longer change the zoom.
- Fast horizontal and vertical timeline scrolling keeps the canvas covering the viewport and prepares newly visible tracks before painting.
- Desktop startup resolves the shared JSON storage adapter when organizing project categories.
- Horizontal timeline scrolling keeps clip artwork, titles, trim handles and audio waveforms aligned; audio titles stay above waveforms and zoom badges retain the theme's text color.
- VP9/AV1 exports on Linux use buffered software decoding to prevent decoder flush failures. Multi-video scenes retain every current image instead of evicting visible layers when the seek-history cache fills.
- Imported VP9 videos, timeline thumbnails and video posters use buffered software decoding on Linux to prevent hardware decoder failures during playback and seeking.
- Shape and zoom selections no longer prevent manual navigation to Clip.
- Spotlight no longer flashes on each typed letter or scales its text when opening; panel height changes animate smoothly.
- Tooltips preserve intentional line breaks, including the perspective explanation.
- The eyedropper on Wayland uses the native color portal without closing the screen chooser immediately or dismissing nested color pickers; cancellation and failures have clear feedback.
- Color picker popovers stay open when a drag starts inside and ends outside, including nested pickers; a new outside click still dismisses them.
- The color picker's saturation/value pad now paints one continuous rounded surface, removing gaps and seams around its corners.
- Selected editor sidebar sections now use Beam's orange and matching legible labels and icons in both themes, including Settings, without a permanent border around the active item.
- Recenter and undo/redo overlays use quieter shadows with enough canvas margin to avoid clipping against the editor bars.
- Linux recordings with the real cursor enabled respect hidden-cursor metadata and refresh cursor-only frames without leaving trails.
- Gradient preset tiles now render clean rounded corners without repeated color seams along their borders.
- Whisper transcription now releases decoder and alignment buffers to prevent GPU memory accumulation. Failed workers are released before retrying, and failure reports show the planned segments and actual inference time.
- Linux AV1 playback and timeline thumbnails use the software decoder to avoid hardware decoding failures during seeking. Copied playback diagnostics now identify the file, clip, codec, decoder configuration, operation and exact source/timeline position.
- Copy buttons keep their icon stable while copying, then show confirmation without briefly flashing disabled or displaying a spinner.
- Playback errors now show a sad Beamy and a translated diagnostic copy button in the editor preview, instead of drawing technical errors into the canvas.
- Double-clicking a project’s action menu no longer opens the project behind it.
- Window and Full screen previews stay behind the source selector, including during rapid hovering and late preview loading.
- Moving between source cards keeps the same preview visible, avoiding repeated window-opening animations and preview remounts in development mode.
- Centered the Beam logo and wordmark vertically in the recorder toolbar, including animated text.
- Editor opening now shows Beamy with a single friendly, translated status, no HUD titlebar, and a Cancel button that safely returns to the recorder without deleting the project.
- Beamy shows a downcast expression with round eyes when editor opening or another Beamy status fails; editor error actions stay accessible with long translations.
- Project playback starts after saved editor settings are restored; audio waveform GPU work runs in a shared worker to keep the editor responsive during loading.
- Saved project thumbnails use the same media protocol as video previews, so development windows display them instead of a broken image.
- macOS window selection excludes privacy indicators and other system UI surfaces while retaining real application windows.
- The first countdown value now waits for its mounted renderer as well as native window readiness, preventing an empty countdown on first use.
- The Beam wordmark stays vertically centered and unclipped at rest; its text easter egg eases back to the original layout after each interaction.
- Full screen region controls keep a visible margin at the top and bottom, and their placement adapts to translated labels, wrapped controls and device errors.
- The region selector shows the live desktop through its transparent crop instead of covering it with a frozen screenshot; the snapshot is used only by the magnifier.
- Region controls return directly to their final position at screen edges, and the selector loads independently while its native desktop preview prepares.
- Linux region capture chooses a monitor once through the Portal and reuses that authorized source for the magnifier and recording. Accidental clicks no longer create empty crops.
- Windows/macOS HUD popovers temporarily expand the transparent window; Linux menus scroll within compact bounds so added transparent space cannot block desktop clicks.
- Development builds and launches now find native capture binaries in the Cargo-configured build directory, including shared Linux caches.
- Linux now selects X11/XWayland at launch to avoid GPU startup crashes and enable native placement; screen region selection waits for renderer readiness and opens at the exact display bounds.

### Removed

- Removed the redundant Elements sidebar section; its properties are available in Clip.
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
