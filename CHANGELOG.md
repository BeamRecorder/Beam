# Changelog

User-facing changes to Beam are documented in this file.

## [Unreleased]

### Added

- General settings now offer Minimize to tray on close, with an explanation in all fifteen languages. Enable it to keep Beam running in the tray; leave it off to quit when closing the Recorder.
- The private website’s Studio overview shows a real recording edited on the native multi-track timeline in a fifteen-second, 60 fps loop, including trim/split/cut, a caption, appearance and canvas adjustments, and a 2D zoom. Light/dark variants and editable source live in `examples/website-studio-loop/`.

### Changed

- The website’s Studio overview now runs for 15 seconds with gentler cursor travel, longer reading pauses and two restrained camera views that stay fixed during edits.

### Fixed

- General settings switches keep their labels and pointer appearance stable while saving, including Minimize to tray on close, while preventing duplicate changes.
- Fixed Linux FFmpeg GPU exports failing before the first frame with "Expected portable JSON data" when optional watermark or cursor metadata was unset.
- Window capture now includes supported native dropdowns, right-click context menus and application menus on Windows 11 24H2 and later, within the recorded window's bounds.
- Recordings made with Show Real Cursor now start with Beam's cursor disabled in the editor, preventing duplicate cursors. Later manual choices remain saved.
- Fixed black Region selection screens on Windows by showing the captured desktop before selecting an area.
- Webcam previews now fill their frame without black bars, preserving proportions with a centered crop.
- Fixed a freeze when clicking or moving color, shape, text, image and drawing layers in the timeline.
- Fixed stale mouse handling after returning to the Recorder and repeated input changes when the window gains or loses focus.

## [0.5.2] - 2026-10-06

### Added

- A discreet Recorder update action explains the available version on hover, downloads in the background, shows progress and offers Restart to update. A brief two-second shimmer highlights its first appearance and respects reduced motion. Red indicators on the settings gear and Updates category keep available updates visible, with labels translated into all fifteen languages.

- The private website’s Zooms page demonstrates manual Screenshot 2D, 3D and glass layers in a nine-second, 60 fps loop, with native controls, light/dark variants and matching posters. Editable source lives in `examples/website-still-zoom-loop/`.

- The private website’s Edit header has a minimal, themed three-track animation with macOS trim cursors, offscreen suspension and reduced-motion support.

- The private website’s Edit page now includes themed native Beam video demonstrations for transitions and local export, with matching posters, pause controls and reduced-motion support.

- The private website’s Zooms page shows two eight-second, 60 fps demonstrations of native 2D camera movement and 3D directional perspective, with light/dark variants, matching posters and pause/reduced-motion support. Editable source lives in `examples/website-zoom-loops/`.

- Added editable HTML glass-lens demonstrations with native circle/freehand controls, appearance adjustments and editable automatic lenses generated from recorded clicks, plus themed compressed website loops.
- Added editable HTML demonstrations for teleprompter playback, text size and color, and local projects, sharing native Beam controls with themed compressed website loops.
- Added the editable “Take a breath” Recorder demo with supplied facecam footage, the Beautiful Captures pointer, native pause/resume controls and compressed website videos.
- Added a reusable HTML Recorder demo showing full-screen, region and window capture choices, capture modes and recording controls, with Beautiful Captures cursor artwork and themed website videos.

### Changed

- HUD controls with visible labels no longer show redundant hover tooltips; icon-only actions retain their hints.
- The local-project website demonstration zooms into Projects actions and pulls back as the file browser opens, using Beam’s editable native 2D camera in both themes.

### Fixed

- Update popovers can be dismissed by clicking anywhere in the HUD topbar; Settings places the changelog on the left and Download or Restart on the right.
- Update downloads start only once across windows, remain available for retry after a failure, and cannot be reset by checking for updates while downloading or ready to install.

- Shape thumbnails refresh after editing vector points, including speech-bubble peaks and Bézier handles.
- Available switches in the Off state are easier to distinguish from unavailable settings, with clearer thumb contrast and muted labels for disabled preferences.
- Quick Snip microphone, system-audio and camera menus have aligned options, clear selection checks and a simple opening without excessive zoom, using the shared Beam popover appearance.
- Recording pauses can be removed when screen, webcam and audio segment boundaries differ, preserving recorded frames, audio/video synchronization and downstream zoom timing. Gap actions display a single tooltip.
- Packaged camera previews load their styles before the first frame, preserving the full webcam image; Quick Snip settings also retain their production styling.

## [0.5.1] - 2026-10-05

### Fixed

- Moving split recording fragments reuses unaffected zoom history instead of recalculating the entire recording on every pointer update, keeping the editor responsive. Narrow timeline gaps retain their Remove gap action, including two-second cuts in long recordings.
- Screenshot and video editors open within the current display's usable area, including Windows 150% scaling and saved sizes from larger displays, so editor controls remain reachable.
- Compact editor layouts keep inspector scrolling, capture/export controls and playback actions accessible; video timelines adapt to shorter windows without replacing the saved height preference.
- Circular and freehand Loupe zooms retain finer text detail by rendering original sources at lens density, with matching Screenshot/video exports and HiDPI previews.
- Windows region selection resolves native monitor IDs correctly at 150% scaling and on mixed-DPI desktops, restores the saved crop visibly, and accepts the recording shortcut with the current toolbar settings.
- The Recorder stays loaded while a region is being selected, so a long selection cannot lose its capture request or saved settings to background standby.
- Long recordings keep bounded screen and camera/audio write queues; Windows limits retained video surfaces and capture frame rate, and macOS uses a smaller resolution-aware surface queue.
- Recording writes and final file synchronization keep the desktop responsive. Encoder stalls and missing camera/audio finalization events have deadlines; Stop no longer resumes a recording counter after the native recording has ended.
- Camera previews show the complete image without cropping it to the overlay shape, keep recording when their window is hidden, and avoid accumulating status requests when capture is busy.
- Automatically opened webcam previews reset saved browser zoom and prevent browser zoom shortcuts from changing the preview window.

## [0.5.0] - 2026-10-04

### Added

- The private website’s Edit transitions and export sections now show eight-second, 60 fps light/dark loops with native transition previews, editable title layers, export settings and local-file progress. Reusable source lives in `examples/website-finishing-loops/`.

- The private website’s Edit captions and voiceover sections show eight-second, 60 fps light/dark loops using native Beam controls, timed words, audio waveforms and macOS cursor interactions. Reusable source lives in `examples/website-speech-loops/`.

- Project thumbnails reveal a translated Open project action at the bottom right on hover or keyboard focus, with batch selection preserved.
- Video editor Developer Mode can add a lightweight CC0 demo webcam linked to an existing screen recording. One repeated webcam lane covers the recording and supports zoom reactions, camera layouts, project saves and undo/redo; the action is translated into all fifteen languages.

- Cursor click effects offer a Water Drop mode that refracts the screen with a single soft wave and adjustable intensity, spread, duration and softness. Left and right clicks keep independent styles and settings; ring modes support size, opacity, duration, stroke and color. Illustrated choices show actual effects with the macOS pointer and appear only when enabled. The cursor inspector uses compact accordions and fully translated controls and builtin cursor names in all fifteen languages.

- Screen, camera, video and image clips offer five animated border presets that follow their rounded, circular or squircle contours, with adjustable thickness and speed and matching timeline previews/exports. Frame styles and animation presets use thumbnail selectors alongside Safari, Windows 95 and phone frames.

- The private website’s AI-native section demonstrates live HTML-to-canvas editing with Beam’s native controls and two 2D zooms, in both system themes. Reusable source lives in `examples/website-html-canvas-loop/`.

- The website's Edit Cursor section shows a seamless light/dark demo of complete native macOS/Bibata packs, enlarged role previews, text/move/resize interactions, smoothing, cursor size and spring/ripple click effects, rendered with Beam CLI. Its reusable source is in `examples/website-cursor-loop/`.

- The private website's Edit Canvas section shows a seven-second loop selecting real image, video, color and gradient backgrounds with Beam's native controls, Safari frame and macOS pointer spring/click effects. The light/dark videos support pause and reduced motion; reusable HTML/GSAP source lives in `examples/website-canvas-loop/` and publishes through Beam CLI.

- The private website's Edit timeline section shows a five-second cursor-driven trim and arrange loop, using Beam's real UI and timeline renderer, with light/dark themes and pause/reduced-motion support. Its HTML/GSAP source is reusable in `examples/website-editing-loop/` and publishes through the Beam CLI.

- Private website AI native demo now uses a lightweight Zaro recreation with sound disabled by default, playback controls and a tooltip explaining HTML/GSAP authoring and Beam CLI rendering.
- Added reusable HTML/GSAP launch-video templates for typewriter sentences, prompt fields, macOS cursors and smooth camera moves, with a complete example and customization guide.

- Added `examples/ai-native-zaro/`, a separate Beam CLI project reconstructing the supplied 68.6-second Zaro film in HTML/GSAP, with local reference assets, its original soundtrack, reversible seeks and frame verification.
- Added the reusable `examples/ai-edits/` HTML/GSAP announcement composition, with official Edits references, the supplied iPhone frame, verified CC0 music/impacts and Beam CLI project publication/export.
- Private website AI native documentation covers live video and Screenshot editing, HTML/TypeScript publication, live code previews, native text/fonts and CLI exports with copyable examples and product-media instructions.

- Arrows can be drawn by placing anchors manually: click for corners, drag for Bézier curves, and finish with Enter or a double-click. Only authored anchors are retained in screenshot and video projects.
- Screenshot and video editors offer a searchable library of 30 arrow presets with previews and editable vector points with Bézier handles, corner/smooth modes and point insertion/removal. Canvas drawing offers a visible confirmation action and Enter shortcut. Custom paths survive project saves and use the same preview/export renderer.
- Region and Quick Snip settings offer automatic Loupe zooms using recorded clicks, with matching editable timeline lenses and video exports. The default zoom mode remains 2D.
- Hyprland can record a separate cursor for monitor and region captures through compositor IPC when its portal provides no cursor metadata.

- Recording and editor settings offer a shared project location preserving `projects/studio`, `projects/instant` and `projects/screenshot`. New captures use the chosen root immediately; the project picker retains previous locations and refreshes when they change.
- Video and image exports share a separate folder preference, with a fixed destination or the last successfully used folder and a searchable list of recent folders.
- Safari frames offer Auto, Light and Dark browser chrome independently of the frame color, with matching previews, screenshots and video exports.

- Screenshot copy and image exports provide a timing report for resource loading, rendering, encoding, caching and native clipboard/file publication, available from the result toast and developer console.

- Screenshot Composition shows expandable groups with their member layers together, including the logo and editable text in a brand group.
- Screenshot Composition adds a Group shortcut beside effects, precise drag-and-drop into and out of groups, and fading layer names that scroll on sustained hover without horizontal scrollbars.
- Screenshot group members can be selected individually from Composition, while group headers select all members; dropping above or between groups keeps layers in the root list.
- Screenshot groups and multiple selections expose shared position, alignment, size and rotation controls in the Placement inspector, with proportional native text resizing and undo/redo.
- Screenshot layers support native X/Y 3D rotation with a shared perspective for preview, editable text, thumbnails and PNG export.
- Screenshot supports left-drag selection on empty canvas, right-drag selection, persistent groups with shared move/resize bounds, Ctrl/Cmd+G and Ctrl/Cmd+Shift+G, and alignment guides with document-pixel dimensions and spacing.

- Agents can discover and import fonts through the CLI for editable native text, with the same fonts preserved in screenshot exports.

- Screenshot layers support non-destructive hue, saturation, brightness, contrast, monochrome, sepia and inversion adjustments, with live previews, CLI editing, undo/redo and matching exports.

- The CLI can rename every Screenshot layer, including background and watermark, through `still.layer.rename`, with the same lock protection and undo/redo as editor naming.
- Screenshot Composition supports gradient effects attached to layers, using BEBE-ui's Mesh, Flow and Silk shaders and six presets. Colors, grain, geometry and light controls use translated inspector accordions; saved effects support undo/redo, copy/paste, live CLI edits and matching PNG/WebP exports.
- The CLI discovers agent tools and bundled/GitHub documentation, controls open Studio and Screenshot projects with revision checks and editor undo/redo, and publishes persistent HTML/TypeScript layers. A file watcher updates the preview after code saves; seekable GSAP/WebGL compositions share their source with frame and video exports.
- Private website documentation covers Recording, Screenshots, Instant, macOS/Windows/Linux setup, permissions, clipboard behavior and local file storage, with product-media slots to complete.
- All private website copy uses English translation catalogs through Nuxt i18n, ready for additional languages once the wording is finalized.
- A private Beam marketing website with server-rendered pages, light and dark themes, and an interactive MacBook video showcase.
- Video and Screenshot share manual 2D, 3D and GPU glass zooms, with circular or freehand lenses, pixel-based focus/diameter controls and grouped appearance settings in all 15 languages. New lenses use a larger 60% diameter and restrained glass defaults.
- Automatic glass lenses group nearby recorded clicks, adapt magnification and diameter to the clicked region, respect reserved timeline intervals and remain manually editable. Focus follows trimmed, retimed, mirrored, rotated and framed recordings and scene transforms.
- Background library items can be removed with an exact-item preview and destructive confirmation in all 15 languages. Imported images/videos have a Delete action above Show more; colors/gradients pair editing with a compact trash button. The last deletion supports persisted undo/redo while existing projects and source files remain intact.
- Media orientation controls provide horizontal/vertical mirrors and 90° turns; media and text share precise angle editing and a canvas rotation handle in preview and export, translated into all 15 languages.
- Recorder General settings can launch Beam at login, enabled by default for installed applications, with Linux XDG autostart and Windows/macOS login items. The setting is translated into all 15 languages.
- Video and image clip inspectors have compact numeric placement controls, a nine-point alignment pad and a proportional size lock, with positioning calculated by the shared engine and controls translated into all 15 languages. Numeric typing commits on blur or Enter; mouse drags update immediately.
- CLI video exports can select WebCodecs or experimental Linux FFmpeg VA-API encoding, using the same Beam renderer and GPU transport as desktop. Exports return JSON diagnostics and protect destinations on failure or cancellation; the FFmpeg backend requires an X11/XWayland display and compatible native dependencies.
- The Chromium CLI host can select software video decoding independently of GPU rendering to work around failing accelerated decoders.
- Linux desktop has an opt-in experimental FFmpeg GPU exporter for MP4 and WebM, with direct DMA-BUF transfer to VA-API and audio support. Its export option is translated into all 15 languages; native build and driver requirements are documented.
- A WebCodecs diagnostic command checks CPU/GPU frame inputs in separate sandboxed Electron processes, records encoded packets and native GPU crashes, and compares hardware requests with software controls.
- Export reports include native GPU utilization minimum, median, mean and maximum, plus per-engine measurements on Linux, Windows and macOS when driver counters are available. Reports identify process-wide versus device-wide scope and unavailable measurements.
- Create and edit video or image documents through a shared engine API and CLI, with identified JSON transactions, revision conflicts, retry deduplication and undo/redo.
- Packaged CLI launchers use Beam's bundled Electron runtime and support native recording/screenshot commands without a separate Bun or Node installation.
- Render seekable HTML/Vue motion projects through the shared video renderer and encoder, including paused GSAP animations.
- Extract a video frame into an editable image document, then modify layers and export PNG or WebP through the same still renderer as Screenshot.

- Documents support nested scenes with group transforms, opacity, blending, masks and local clocks, plus generic property keyframes editable through shared commands and the CLI.
- CLI export runs in headless Chromium on Linux without an X11 or Wayland display; imported fonts use explicit portable resources.
- A development CLI can inspect, edit and benchmark Beam documents, and export portable render snapshots through an independent Chromium backend without opening the editor.
- Export diagnostics include bounded engine measurements with median/p95 timings for decode, rendering, encoder waits and separate GPU submission/execution stages.
- Screenshot layers can be renamed by single-clicking their title in the left inspector header or double-clicking their Composition label (or pressing F2), with saved names, undo/redo and copy/paste support.
- Screenshot shows a translated Recenter view button when the preview is moved or zoomed too far, matching the video editor.
- `bun run dev` now starts Vite and Electron together, with automatic ports and persistent Electron profiles isolated per worktree; `--session <name>` supports additional parallel sessions in the same worktree while retaining the usual shared project library.
- Recording settings share a saved Off/2D/3D automatic zoom preference, defaulting to 2D. Recordings with click data can regenerate automatic zoom positions after confirmation in all 15 languages, preserving manual, locked and detached zooms.
- Added 11 macOS Golden Gate wallpapers in WebP format to the Studio and Screenshot background library, including light, dark, day, evening, sunset, night, 4K and 5K variants.
- Double-clicking empty Studio canvas space opens the grouped Add menu, while double-clicking clips still opens text editing or cropping.
- Video editor Accessibility settings can require double-clicks to add zooms, captions and elements from empty timeline tracks, preventing accidental additions.
- Recorder and region settings can record the real system cursor on Windows, macOS and Linux while keeping automatic zooms. These recordings start with Beam's custom cursor overlay disabled; a toggle in the Cursor header can enable it again, and the choice is saved with the project and used for exports.
- Studio and Screenshot share a compact Ctrl+F / Cmd+F Spotlight with grouped Add, Clips, sections, settings and actions. Clips show their project thumbnails; results stay aligned and scroll smoothly, with scroll shadows and mouse Back/Forward navigation.
- Development Settings now include shortcuts to detached DevTools and a separate Mascot Lab, with adjustable eye size, width, height, spacing and vertical position. Eye proportions are saved with lab presets and included in exports.
- Added a shared screen/window chooser for Windows and macOS with searchable thumbnails and keyboard navigation. Development launches can supply 3 simulated displays and 21 windows through `DEV_CROSSPLATFORM=1`, including on Linux; normal Linux capture retains the Portal.
- Beamy appears centered during loading with translated tips, then disappears when the recorder is ready. Clicking the Beam wordmark plays one of twelve text effects before returning to plain text.
- The recorder shows a lightweight animated Beamy while its interface loads, with a retry action if startup fails.
- Instant export shows the shared Beamy loading animation and celebrates completed videos, respecting reduced-motion preferences.
- Region recording now offers a desktop magnifier, live pixel dimensions, Full screen and size presets, teleprompter, device controls and a 0–10 second countdown. Controls hide during dragging and return with a spring animation. Desktop icons and the taskbar/Dock can be hidden from capture on supported platforms.
- Capture problems now appear in the toolbar with a count and a scrollable hover panel, including individual copy actions.
- Settings and Projects now open in separate, resizable desktop windows.

### Changed

- Developer Mode's demo webcam now uses a cropped, lightweight CC0 interview with an unobscured speaker instead of finger-counting footage.
- Cursor accordion headers contain only the section title and chevron; shadow and auto-hide switches and Advanced controls sit beside their related settings inside each section.
- The Water Drop click thumbnail magnifies the actual single-wave refraction over a contrasting cyan grid so the effect remains visible in the selector.

- Border and frame settings have clearer spacing, and linked recording tracks no longer add a second divider below playback speed.

- Media framing keeps rounded corners and shadow sizes proportional between reduced editor previews and full-resolution exports.

- The complete native cursor-pack showcase uses a light presentation surface in both themes so dark artwork stays legible, while editor controls keep their system theme and macOS pointer.

- Website feature demos use distinct fixed Beam gradient presets: Ember for the timeline, Bloom for canvas styling and Tide for the complete cursor-pack showcase.

- The website's “Shape the pace” loop uses Beam's macOS arrow and horizontal-resize cursors, switching on the trim edge with correctly aligned native hotspots.

- The website timeline demo now uses Beam's fixed Ember gradient behind the editor instead of an ambient glow.

- Beam source is now licensed under MPL-2.0, with existing MIT grants and third-party licenses preserved. Licensing documentation distinguishes open-source rights from planned Desktop Pro subscriptions and cloud services; activation is not introduced in this release.
- Linux GPU export helpers are built and packaged only against dynamically linked LGPL FFmpeg libraries. CI uses a pinned LGPL-only build dependency; FFmpeg executables and libraries remain external to this backend.
- CLI project opening creates an independent video or Screenshot editor by default, preserving existing projects; `disposition: "reuse"` optionally replaces the active editor in development and installed releases.
- Private website Screenshot documentation explains selection groups, 3D perspective, gradient/color effects and native CLI capture.

- Drawing and arrow inspectors now use compact Path, Appearance and Text sections. Double-clicking a drawing or arrow edits its anchors directly; clicks insert smooth points and anchor alignment guides assist placement. Freehand strokes retain fewer meaningful editable points.

- Anchor points and resize handles use a shared neutral light/dark tone sampled across the selection, with an opposing outline to remain visible on textured images.
- Shape inspectors share compact placement, path, appearance, text, opacity and shadow accordions, with native editable text labels and controls translated into all 15 languages.

- Beam's onboarding has a taller, centered welcome inspired by the website, with offline landscape photography, interactive Recorder and Quick Snip introductions, video and screenshot feature previews, clickable step navigation, shared theme and language controls, and a project-folder choice in all 15 languages. Interaction permissions remain optional and show their actual status.

- Quick Snip recording uses the standard recording controls. Its export mascot keeps the shared loading animation through preparation and export, then turns green with one confetti burst and natural blinking on success.
- Screenshot and video editors reuse background/cursor catalogues, presets and decoded images when switching projects in the same window, while keeping document state and media decoders separate.
- Video undo/redo controls sit next to timeline snapping; editor search stays in the titlebar.

- Screenshot startup overlaps editor module loading with project reads, retains scene images in a bounded LRU cache, loads imported fonts concurrently and defers layer thumbnails until the first preview. Per-stage loading measurements are emitted to the development console.
- Screenshot copy overlaps document saving with image encoding, loads fonts and images in parallel, and confirms copy/export completion with an output thumbnail and green success or red failure badge.

- The Beautiful Captures promo keeps secondary feature labels and icons more visible while retaining the slot-machine hierarchy.
- The Beautiful Captures promo composition uses Beam’s capture icons, the supplied rounded cursor SVG and a tighter layout with larger editable labels and one dashed Captures region.

- Text controls remove the redundant Edit text action and use clearer neutral alignment icons and concise numeric values. Element opacity toggles live inside their accordions, and the frosted Screenshot inspector confines its blur to the panel without softening the adjacent canvas.

- Screenshot uses a full canvas viewport behind frosted theme panels, with compact neutral Effects/Color actions and precise draggable opacity. Procedural gradients reuse the shared palette editor and display a live preview of Mesh, Flow and Silk.
- Text and shape properties are organized into inspector accordions for content, typography, geometry, fill, borders and shadows.

- Screenshot Composition uses compact Effects and Color menus, draggable numeric opacity beside blending, and original/processed thumbnails that open effect settings. The properties inspector uses the same translucent, blurred theme surface.

- Private website platform badges use green checks and red crosses, flow beside guide text, and category headings retain plain text without icons.
- Private website missing-page errors show a dedicated Unsplash scene for each system theme, with direct actions to return to the previous Beam page or its home.
- Private website docs use clearer text, Beam/Lucide icons, short guide titles and a Platform category, with subtle system-support badges beside limited features.
- Private website documentation opens with system-aware forest photography and adds grouped guide navigation, section links and copyable commands.
- Private website feature menu hover and keyboard focus use an opaque theme gray and neutral border that stay visible over the blurred background.
- A lightweight smooth scroll gives every private website page, including the FAQ, documentation and downloads, a gentle easing tail while preserving native touch scrolling and reduced-motion preferences.
- Private website footer links use larger text and a more spacious mobile layout.
- The private website navigation fades away while scrolling down and returns while scrolling up, with safeguards for open menus and keyboard focus.
- The private website FAQ opens with theme-aware lake photography, a soft transition into the answers and clearer category navigation.
- The private website navigation blends Beam's dark surface color with its backdrop blur.
- The private website's cropped footer wordmark fades into the page with crisp lettering.
- Expanded the private Beam website with system-aware downloads and appearance, blurred navigation, a large faded footer wordmark, dedicated feature and documentation pages, the complete FAQ, and Free / Pro pricing with a launch waitlist.
- Quick Snip uses neutral mode/source choices and one fixed circular capture button, with smooth device/icon transitions; source selection opens only when Capture is pressed, source tabs remain responsive, and empty toolbar space supports native dragging.
- Tray Quick Snip is separate from Show/Hide Beam. Quick Snip loads screenshot effects only after capture. Hidden idle Beam releases its HUD and auxiliary renderers; completed or canceled Quick Snip releases its toolbar, menus and device previews.
- Startup temporary audio cleanup scans project folders directly, avoiding loading project timelines and recording data before Beam opens.
- Project pickers load their first catalogue faster by reading each video project once per request. Missing video thumbnails render directly at preview size rather than allocating full-resolution canvases.
- Project pickers use a persistent lightweight index and automatically load batches as you scroll, with search and Select all covering the entire library. Catalogue work runs outside the main thread and releases its worker when idle.
- Screenshot Composition requests thumbnails only for visible rows plus a scroll margin, cancels queued offscreen work and keeps a bounded cache for immediate reuse when returning to a layer.
- Timeline scrolling retains unchanged virtual row and item lists, reducing repeated updates of clip controls, icons and shared handles.
- Timeline clips share modern type colors, rose zooms and gold captions in both themes, with equal track heights, full-height blocks and matching rounded trim handles revealed on track hover or keyboard focus.
- Gradients use a compact preview, draggable keyboard-accessible stops, precise position/opacity fields and shared color controls, with all labels translated into 15 languages. Color and gradient stops share the full picker surface without a redundant header or extra frame.
- Background images, videos, colors and gradients share the same active border and focus treatment, with the selection ring kept visible above media pixels.
- Destructive actions use a calmer shared theme red with white text/icons; small trash buttons match the height of their adjacent labelled actions.
- Shadow direction uses the shared neutral preset controls, and a help tooltip explains solid and adaptive shadows in all 15 languages.
- Popovers and nested menus use a stronger shared 12 px backdrop blur in both themes; numeric unit menus show clear hover feedback and compact affix spacing.
- Clip dimensions default to canvas pixels with a clickable px/% unit selector that preserves document placement, and the compact rotation row shows at most two decimal places with the same controls for text and media.
- The placement reset appears inside the expanded clip controls, keeping inspector section headings consistent.
- Clip properties are grouped into animated accordions with neutral surfaces and consistent spacing; property search opens the matching section. Video and screenshot inspectors are slightly wider and reserve scrollbar space to prevent field shifts when sections expand.
- The experimental Linux FFmpeg GPU export choice is now saved across restarts, shared with General preferences, and applied to Quick Snip video exports.
- Experimental Linux GPU exports overlap rendering and native transfer through a bounded GPU texture queue, use one frame IPC and wait one presentation boundary per frame. Reports separate capture, transfer and queue waits; the dedicated CLI process also removes display frame-rate throttling while retaining every authored frame. Local before/after results are documented; gains vary by container and workload.
- Experimental Linux GPU exports send DMA-BUF descriptors through an asynchronous native bridge instead of launching a process for every frame. Reports separate Chromium presentation waits, GPU import/conversion and native encoding timings.
- MP4 and WebM exports select a working WebCodecs encoder at the requested resolution, frame rate and bitrate, checking hardware variable and constant bitrate modes before software encoding. Linux desktop and hardware CLI backends enable accelerated video encoding; reports show the selected bitrate mode and hardware frame-check failures.
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
- Video and screenshot project pickers retain their cards between openings while refreshing the catalogue, reveal projects and decoded images smoothly, and generate up to two visible video thumbnails concurrently.
- Screenshot's lighter editing dock includes undo/redo, while dimensions, fullscreen and Settings live in the topbar. The dock, Composition and topbar share subtle frosted surfaces; the preview supports wheel zoom and middle-button or Space-drag panning without changing exports.
- Screenshot editing uses a centered floating tool dock and a contextual inspector on the left, consistent with the video editor. A visible Properties toggle smoothly hides and restores the inspector without losing its context, replacing the separate Canvas/Clip/Settings navigation rail.
- Development launches reuse the configured Cargo target directory and incremental compilation cache across worktrees, while keeping each running instance's native executables separate.
- Quick Snip opens as a compact, movable single-row toolbar with Video/Image, source and device icons, shared settings with scrollable presets, and an icon-only capture button. Screen/window selection reuses the Recorder chooser; region drawing starts with Start or Enter. Toolbar positions are remembered per display, with native background blur on Windows/macOS and translucency on Linux.
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
- Projects opens in a smaller window with square cards that adapt to resizing. Missing thumbnails are generated only for visible projects, with bounded concurrency.
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

- Region selection stays aligned with the full display on GNOME without panel-induced offsets, including at the bottom-right edge. Its visible frame and pixel dimensions now match Screenshot, Studio and Instant captures at different display scales.
- Screenshot region captures preserve odd dimensions and the last selected row and column through a shared native crop on Linux, Windows and macOS.

- Developer Mode's demo webcam imports correctly through the native bridge, saves repeated fragments without rounding overlaps, and retains its recording link and zoom reactions after reopening a project.

- Russian and Bulgarian website FAQs now display their translated questions and answers, including the current source license, instead of internal category identifiers.
- Linux CI and release packages now compile and verify the experimental GPU export backend. Packages include only Beam native artifacts and use system FFmpeg libraries, preventing the backend from being omitted without bundling FFmpeg.

- HTML playback and scrubbing now follow the shared runtime clock directly, skip the hidden canvas, and continue low-frequency thumbnail captures during interaction, with full-size refinement afterward. HTML timeline thumbnails decode and resize in a background worker, using smaller isolated render surfaces.

- HTML preview waits for the editor's document registration to complete, preventing an initial still image with audio but no animation when opening a project.
- Animated HTML stays above the editor's still-image canvas while preserving canvas selection and pointer controls.

- Full-canvas HTML compositions preview directly in the editor with synchronized playback, immediate pause and seeking, without per-frame PNG capture or shared GPU textures. HTML timeline thumbnails sample the animation at each source time; an old frame or reload cannot override a newer seek or pause.
- CLI HTML motion exports serve SVG device frames with the correct image type.

- Private website links reset scroll before showing a new page, avoiding a flash of the large footer wordmark while preserving section scrolling and browser history positions.
- Long private website guide contents stay accessible through an independently scrollable desktop summary.

- Shape and arrow inspectors show border color and width in a dedicated Border section with a visible color label in all 15 supported languages. Arrow selector chevrons and project icons align with the visible text.

- Arrow tips now terminate the visible shaft cleanly, without a rounded stroke protruding past the tip. All canvas anchors and transform handles share one adaptive neutral color across the selection.
- Hyprland recording overlays no longer inherit compositor borders and shadows; editor, settings and project windows keep their normal decorations.

- Restored the GitHub star count in the community panel and protected shutdown against late events from destroyed windows.

- Linux interaction recording keeps its saved activation across helper restarts, updates and failed authorization. Quick Snip starts interaction access automatically before recording, shares one authorization request across windows and reports failures instead of silently losing click data and automatic zooms.
- Recording controls show a persistent warning if Linux interaction access, input devices or the event stream fail during recording. Video capture continues, the project keeps the diagnostic, and idle periods without clicks do not trigger false errors.
- Video export reuses the last successfully used destination across projects and application restarts instead of always returning to the OS Videos folder.
- Screenshot project thumbnails now show the edited composition, including HTML layers, gradients and text, and refresh automatically in the background after edits.
- Moving a selected Screenshot group member changes only that layer; selecting the group header still moves all members together.
- Screenshot canvas clicks select a group first, then its clicked member; double and triple clicks edit that member without expanding the selection.

- Screenshot rectangle selection can start in the workspace outside the canvas and remains accurate when the preview is zoomed, panned or UI-scaled.
- Editable text keeps the same vertical position when leaving inline editing, including centered text beside a logo, with matching preview and export.

- Composition scrolls independently of canvas zoom. Empty canvas clicks clear selection, and double-clicks open Add. Disabled composition controls explain their state after 200 ms in all 15 languages.
- Fields, sliders and secondary buttons retain visible neutral borders in light theme.

- `bun run dev` serves the desktop renderer from its configured directory, restoring the Recorder, onboarding and HUD panels instead of loading missing pages.
- Navigating between private website guides keeps the page shell, topbar and smooth scroll alive, avoiding full reloads and repeated entrance animations.
- The private website's Beam logo stays on a stable rendering layer while the navigation reappears.
- Private website smooth scrolling starts before Nuxt hydration, removing the delay after the page first appears.
- Private website FAQ accordions use Beam's shared desktop disclosure and reveal animation.
- Private website section links keep their correct position while content fades into view.
- Private website download buttons animate their text and operating system logo together on hover.
- Private website download buttons preserve the original Linux, Windows and Apple SVG logos instead of recoloring them.
- The private website navigation now blurs scrolling content correctly.
- The private website prevents vertical scroll bounce from exposing a blank strip above the hero.
- Quick Snip settings stay attached to their trigger on every opening, close on a second cog press, animate from the cog, prepare while the toolbar is active, and use a light shadow without horizontal or duplicate Select scrollbars. Device choices use Beam menus instead of native context menus.
- Quick Snip settings open on the development session's selected port, including when other Beam instances already use the default port.
- Audio waveforms now redraw during timeline zoom without waiting for thumbnail work or an obsolete crossfade; rapid changes keep only the latest pending draw.
- AI caption icons reserve their own space before the timeline label, including locked captions.
- Add and canvas insertion submenus now blur the content behind them instead of showing it sharply through a transparent background; context menus share the same frosted surface in both themes.
- Adding a timeline element no longer temporarily clears other clips. Canvas artwork follows animated row reordering, and successive drag swaps use spatial hysteresis instead of a 150 ms pause; clip, caption and row positions use `translate3d`.
- Custom radius and shadow choices fill their entire preset slot, matching the click target and highlighted area of adjacent choices.
- Inspector accordions keep their final height during animation at every interface scale, and compact input labels and units stay centered with intact rounded borders.
- The loading mascot’s brief triangle phase now visibly looks around and blinks, in both the startup shell and application loading views, while respecting reduced motion.

- Recorder Settings and Projects open above an always-on-top recorder and follow its topmost preference. Their prepared native windows reopen without reloading the renderer; hidden feature content is unmounted and app shutdown releases the cache.

- Projects created in Studio now generate thumbnails and hover previews from imported video clips, including projects without a screen recording.

- Updating preferences while an editor is open no longer fails on the Recorder window's always-on-top setting; hidden Recorder windows remain hidden and editor windows retain their native behavior.

- Canvas horizontal mouse-wheel scrolling now zooms in and out according to its direction instead of always zooming out; zero-motion events no longer change the zoom.
- Fast horizontal and vertical timeline scrolling keeps the canvas covering the viewport and prepares newly visible tracks before painting.
- Desktop startup resolves the shared JSON storage adapter when organizing project categories.
- Horizontal timeline scrolling keeps clip artwork, titles, trim handles and audio waveforms aligned; audio titles stay above waveforms and zoom badges retain the theme's text color.
- VP9/AV1 exports on Linux use buffered software decoding to prevent decoder flush failures. Multi-video scenes retain every current image instead of evicting visible layers when the seek-history cache fills.
- Imported VP9 videos, timeline thumbnails and video posters use buffered software decoding on Linux to prevent hardware decoder failures during playback and seeking.
- Screenshot exports move rendering off the interface thread, avoid repeated image decoding and oversized working rasters, and reuse unchanged results for repeated saves or copies with a bounded cache. Large Composition lists no longer rebuild every row when export starts or finishes.
- Startup skeletons follow each editor's actual workspace, scaled inspector and controls: Screenshot has its editing dock and Composition instead of a video timeline, while Studio preserves the saved timeline height. Screenshot keeps a correctly sized placeholder until its first canvas paint.
- Theme previews keep proportional miniature layouts and a readable maximum width in recorder settings, including maximized windows and compact editor inspectors.
- Restored Screenshot's topbar search and Ctrl/Cmd+F using Studio's shared command palette, with layer-aware categories, supported properties and capture actions. Search results reopen the left inspector and focus the appropriate Appearance or Text controls.
- Editor project menus fade and lift smoothly from their first presented frame, avoiding abrupt bright flashes when opening and closing without delaying interaction.
- Editor project menus respond on the initial pointer press; cached catalogue refresh waits until after presentation, and first-use loading no longer leaves a blank panel.
- Clicking empty editor topbar space now dismisses its popovers; native window dragging resumes once the menus close.
- Screenshot fullscreen transitions keep their backdrop opaque to prevent bright flashes when entering or leaving the preview.
- Development sessions show existing videos and screenshots and reuse saved preferences from the usual Beam library instead of an empty profile-specific library.
- Fresh development sessions can save onboarding preferences without applying recorder-only window methods to the welcome screen.
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

- Removed the private website footer's “A brighter way to create” tagline.
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

[Unreleased]: https://github.com/BeamRecorder/Beam/compare/0.5.2...HEAD
[0.5.2]: https://github.com/BeamRecorder/Beam/releases/tag/0.5.2
[0.5.1]: https://github.com/BeamRecorder/Beam/releases/tag/0.5.1
[0.5.0]: https://github.com/BeamRecorder/Beam/releases/tag/0.5.0
[0.4.0]: https://github.com/BeamRecorder/Beam/releases/tag/0.4.0
[0.3.3]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.3
[0.3.2]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.2
[0.3.1]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.1
[0.3.0]: https://github.com/BeamRecorder/Beam/releases/tag/0.3.0
[0.2.9]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.9
[0.2.7]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.7
[0.2.6]: https://github.com/BeamRecorder/Beam/releases/tag/0.2.6
