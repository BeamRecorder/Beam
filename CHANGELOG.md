# Changelog

User-facing changes to Beam are documented in this file.

## [Unreleased]

### Added

- Added English guides for Instant, Studio, and Screenshot capture modes, including cropping, composition, clipboard, and export workflows.
- Added one-click Studio canvas screenshots with a three-second shortcut to open each capture in a new Screenshot editor window.
- Added reusable solid-color and saved-gradient controls for shapes and freehand drawings.
- Added multi-item copy, cut, and paste shortcuts with localized feedback in the Studio and Screenshot editors.
- Added direct clipboard-image paste into Screenshot compositions and Studio tracks, double-click crop, and on-canvas rotation handles for elements.
- Added right-drag box selection and Ctrl/Cmd/Shift-click toggling on Screenshot and Studio canvases, including additive drags from existing selection handles, for multi-item copy, cut, and delete workflows.
- Added group dragging for multi-selected items in both Screenshot and Studio without collapsing the selection, with alignment guides for the moved group.

### Changed

- The website hero now switches smoothly between Instant, Studio, and Screenshot messaging, brings the product forward inside a real MacBook frame, and uses subtly animated, soft-edged sparkles with ordered dithering.
- The homepage capture-mode cards now stand on their own with aligned content, while each detailed mode section uses its own colored icon badge.
- Redesigned the Beam homepage around its three capture workflows with accurate local-first clipboard behavior and product demonstrations.
- Property-panel delete footers now blend into the shared, symmetrical scroll shadow without an extra top border.
- Screenshot layers can now be reordered by dragging the layer row directly, without a separate drag handle.
- Screenshot editing now opens on Elements, and new annotation shapes start as unfilled outlined rectangles.
- Crop measurements and confirmation now stay together in a compact floating HUD outside the selected media.
- Copy and paste feedback in Screenshot and Studio now includes a visual thumbnail of the affected element.

### Fixed

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

[Unreleased]: https://github.com/BeamRecorder/Beam/compare/0.2.9...HEAD
[0.2.9]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.9
[0.2.7]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.7
[0.2.6]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.6
