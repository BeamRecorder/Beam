# Changelog

User-facing changes to Beam are documented in this file.

## [Unreleased]

### Added

- Added an adjustable cursor spring when movement stops, enabled by default and saved with editor presets.

### Fixed

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
