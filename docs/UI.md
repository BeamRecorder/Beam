# UI Guidelines

This document defines the visual and implementation rules for the Vue renderer.

## Component system

- Reuse components from `apps/desktop/src/components/ui/` before creating a new control.
- Extend an existing UI primitive when the behavior is shared by multiple features.
- Keep feature-specific composition in the feature folder, not in the shared UI primitives.
- Use semantic HTML and preserve keyboard access, focus visibility, disabled states, and accessible names.
- HUD controls with a visible label do not show hover tooltips, including native `title` hints. Keep hints for icon-only actions and preserve accessible names.
- Keep interactive state in Vue components or composables; do not hide application state in CSS.
- Keep ordinary button and select hover/open surfaces neutral, including their borders and text. Reserve the accent for primary actions and selected navigation or choices; retain a visible neutral keyboard-focus outline.
- `ButtonGroup` uses `variant="primary"` by default for accent-colored selections. Use `variant="neutral"` for neutral selections. Both variants keep unselected hover states neutral and use the theme's matching selected-text color.
- Single-choice groups use `selection="{ index, count }"` for the Recorder's sliding indicator; both `tab` and `selected` buttons share this surface. Keep multi-choice style toggles independent.
- `SelectionIndicator` shares the Recorder's movement timing and reduced-motion behavior between button groups and editor sidebars. Sidebars measure the selected button across menu separators and the Settings footer; scroll and resize updates position it instantly.
- Capture preset options show a labelled illustrative frame in the shared tooltip on hover or keyboard focus, using saved presentation/framing settings and the common composition painter. Previewing never selects or saves a preset, opens a device, or accesses a recording. Load the painter only when a preview opens; unavailable backgrounds show a clear error. Clamp the tooltip to the existing renderer bounds and update its position when async content changes size.
- `Select` hides preview eyes by default. Opt into `showPreviewIndicator` only where `preview:modelValue` drives a visible preview; device and other choice-only menus keep it disabled.
- `PopoverMenuList` choice items use `checked` for a trailing selection check and `menuitemradio` semantics. Pass a boolean for every option to reserve the same space and keep labels aligned; `icon` remains an action icon.
- Available switches retain a contrasting thumb in the Off state. Disabled switches use muted track/thumb colors, and `TogglePreference` also mutes their labels; unavailable settings remain visually distinct from available Off settings.
- Use `busy` for a switch's pending save and `disabled` for an unavailable setting. Busy switches block repeated changes and expose `aria-busy` while retaining their label, pointer and switch appearance, so saving does not flash unavailable styling.

The shared `CommandPalette` composes editor Spotlight views with fixed-height virtual rows and `ScrollShadow`. Use `Button`'s `contentLayout="custom"` for structured rows, keeping label, metadata and chevron in explicit aligned cells. Search inputs use the rounded neutral appearance. Animate height and category changes only; typing and thumbnail completion must retain the list surface. Respect reduced motion and keep mouse Back/Forward navigation inside the palette. Domain adapters supply real editor actions and visible-row thumbnail requests.

Shared settings use `SettingsSection` for category headings and `TogglePreference` for consistent option labels, descriptions and accessible switches. Recorder and editor appearance choices reuse `ThemeModePicker`; System shows both palettes with a localized explanation. Theme Advanced contains colors/style only. Scaling keeps its global slider visible and reveals per-area overrides separately.

Settings navigation, preference pages, global search results and export dialogs reuse `ScrollShadow` from the editor properties panel. Each area has one scroll viewport, with fades only at overflowing edges. Keep the sidebar search fixed and its scrollbar gutter at the sidebar's right edge. Dialogs opt in with `scrollShadow`; only the body scrolls, while the heading and footer remain outside the fade.

Manual Video and Screenshot exports use dialogs for configuration only. On export, release the dialog focus trap and overlay immediately, then animate an inert decorative surface from the measured dialog to a nonmodal bottom-right status pill. Respect reduced motion. `ui/status-pill/StatusPill.vue` shares Quick Snip's geometry, mascot, progress and hover reveal with `export/ExportStatusPill.vue`; native dragging is opt-in for Quick Snip only. Display actual video progress or indeterminate image progress. Successful exports close after five seconds of visible completion, starting after the result is painted and the dialog morph finishes. Preserve the remaining time during hover, keyboard focus or pending actions; a hidden editor starts a fresh five seconds when it becomes visible. Failures and file-action errors remain visible until dismissed or resolved. Keep file/folder actions and a copyable report in the pill; do not add duplicate export toasts. Clipboard copies retain their existing toast.

On success, replace the mascot directly with a simple green checkmark and show the restrained green outline. Its slow orbit remains for the completed pill’s lifetime; reduced motion uses a static outline. Do not add confetti or a liquid transition. Manual exports keep their completion check on the thumbnail and place Watch (View image for Screenshot) before Open folder at the far right, each with a 44 × 44 px hit target and a translated native hint. Quick Snip retains its clipboard and editor actions in the hover panel.

Theme choice previews keep a 3:2 aspect ratio and scale their miniature geometry with the card's container, not just its width. Cap the choice group at 36rem so maximized settings windows keep readable previews; the same group must still fit the compact editor inspector.

Screenshot layer naming reuses `Input`: single-click the selected layer title in the left inspector header, or double-click/F2 in Composition. Do not add a separate name field in the properties body. Enter or blur commits a name, Escape cancels, and inline editing restores the initiating control's focus only for keyboard completion. Names describe layers without changing text rendered on the canvas.

Editor startup uses the same `EditorWorkspace`, preview geometry and layout tokens as the live screenshot/video editors. The shared skeleton surface measures inert presentational controls rather than inventing their sizes, and the Canvas inspector reuses `CanvasPanelLayout` without starting media or preference requests. Preserve UI scale and saved timeline height; do not show a video timeline in Screenshot or guess an output aspect ratio before metadata is available. Loading surfaces start opaque, respect reduced motion and release observers/frames on disposal.

Advanced disclosures use `ui/transitions/RafRevealTransition.vue`. It measures logical, unscaled layout sizes from computed styles so UI scaling cannot overshoot the final height. It measures geometry once, batches style writes per animation frame, preserves the current size on reversal and cancels work on unmount. Its default vertical axis reveals advanced controls; use `axis="horizontal"` for collapsible inspectors. Keep the content unscaled, preserve reduced motion, and use the same transition for opening and closing.

Clip inspectors use `Accordion` with `appearance="inspector"` for flat section headings and subtle separators. Retain collapsed controls with `inert` so drafts survive reopening; property search reveals the relevant disclosure before focusing its field. Use `ScrollShadow`'s `stableScrollbar` option in inspectors to reserve space before overflow appears. Inspector widths live in the shared editor layout tokens, including loading layouts. `AlignmentPad` supplies nine accessible choices without document logic; normalized placement and proportional resizing belong to the engine's layout helpers.

Media dimensions default to canvas pixels while document coordinates stay normalized. Enable `Input`'s optional `unitOptions` and `update:unit` contract for a clickable suffix; callers own conversion. Clip width and height share a px/% display choice that stays outside document history. Rotation combines a precise degree field and independent icon actions on one compact row, shared with text elements; display precision is capped at two decimals.

Bounded numeric placement fields use `Input`'s `commitOnBlur` option: retain the complete draft until blur or Enter, then validate through the engine. Mouse drags still publish immediate gesture updates. Undo and external model changes replace stale drafts.

Canvas text editing uses the shared native textarea with `field-sizing: content`. Input updates its local draft immediately; do not force layout with height resets or delay typing with a timer. Caption and element editors commit once on completion and discard on Escape. Preserve native caret selection and IME composition while typography changes.

## Icons and imagery

- Use icons from `@lucide/vue` for interface icons.
- Do not create fake inline SVG icons or hand-written SVG replacements.
- Use an existing raster/vector asset only when it is a product asset, a captured asset, or a documented visual requirement—not as a replacement for a UI icon.
- Do not use placeholder artwork, fake cursor paths, random animation events, or simulated media data in production UI. Missing capture data must be represented as a clear empty/error state.

## CSS and themes

- Prefer component-scoped styles and local class names.
- Avoid deep selectors (`:deep`, `::v-deep`, or equivalent) whenever possible. Use an explicit class or a component prop instead.
- Before adding a color, spacing, radius, shadow, typography, or z-index value, check whether a theme token already exists.
- Use the existing theme variables from `apps/desktop/src/style.css` and related theme files. Do not introduce a parallel token naming system.
- Hard-coded values are acceptable for geometry that is intrinsic to a component, but not for reusable visual language.
- Keep layout responsibilities clear: parents control placement; children control their internal layout.
- Do not use global element selectors to style a feature unless the global behavior is intentional and documented.

Shared popover and context-menu surfaces use the translucent theme tokens and a 12 px backdrop blur from `ui/floating-surface.css`. Apply the filter to the non-interactive background layer, never the container: filtering an ancestor prevents nested panels from sampling the canvas behind them. Each positioned surface retains its own stacking context and rounded background; menu content stays transparent. Hover/focus feedback uses `--color-bg-surface-hover`. Compact numeric affixes stay close to the edges, with padding on the editable value.

Popover’s `.popover-content` owns the fixed rounded backdrop and border; `.popover-viewport` alone scrolls when its content exceeds the available height. Keep the expanded blur layer outside that viewport so it cannot create a phantom scrollbar or leave a transparent gutter. Select lists may own their bounded inner scrolling without adding another scrollbar to the outer surface.

Verify the rendered blur inside the full panel, including beneath the options and its translucent border. Popover backgrounds extend beneath the one-pixel border and clip at its outer edge using `overflow: clip` with `overflow-clip-margin: border-box`; padding-box clipping would expose sharp content through that border. Browser checks cover both 2D and WebGL canvas backdrops while preserving the menu geometry.

Destructive actions use `Button`’s `danger` variant and the shared `--color-error` palette token; text and icons use `--text-on-error`. Keep icon-only and labelled controls of the same explicit size aligned.

Color fields and gradient stops use the same full `ColorPicker` surface. Avoid an extra opaque frame or duplicate padding around an inline picker. Gradient stop identities survive sorting; support pointer and keyboard movement, cancellation, bounded stop counts and complete numeric drafts. Keep the persisted gradient schema unchanged.

Catalogue deletion uses `ConfirmDialog`’s preview slot to identify the real selected item. Explain catalogue removal and preservation of project sources, focus Cancel first and keep the dialog open during a write or error. The catalogue has its own last-deletion undo/redo controls; do not override document undo shortcuts.

## Visual behavior

Canvas anchors, resize handles and transform controls use the shared neutral contrast directive. Every control in the selection shares one tone, calculated from the combined luminance of their local patches. The preview host requests a refresh after painting; control updates request one after moving. A single 64 px probe per canvas samples at most eight times a second and remains idle between updates. Keep the opposing outline for textured or unavailable pixels, and dispose pending frames/timers with the view.

Timeline lanes share a 32–56 px row height across all categories. Items fill the lane's content height and use the same `--radius-sm` for their canvas body, semantic control and shared `TimelineTrimHandle`. Keep type backgrounds and readable foregrounds in the timeline theme, with rose zooms and gold captions. Reveal handles on track hover or keyboard focus and retain the active handle during trimming. Move clips, captions, hover previews, markers and rows with `translate3d`; duration changes still resize width. Insertions and virtual-window membership changes appear immediately; actual row reorder animations keep canvas artwork synchronized with DOM movement through the shared frame queue.

Keep the neutral lane grid on the timeline stack, behind the shared bitmap. Transformed semantic rows remain transparent and sit above the bitmap so native labels, waveforms, focus rings and trim handles stay visible. During overlapping row moves, canvas painting follows DOM order and the dragged row's stacking priority.

- A loading state must not look like completed content.
- An unavailable track, asset, permission, or recording must be visible to the user and must not be silently replaced with fabricated content.
- Animations must be deterministic and tied to actual application state or recorded events.
- Canvas and media rendering must respect source dimensions, aspect ratio, device pixel ratio, and accessibility expectations.
- Use the existing button, input, slider, switch, dialog, tooltip, badge, and popover primitives for their respective interactions.

## Review checklist

- Is the component using an existing `apps/desktop/src/components/ui/` primitive where applicable?
- Are all icons Lucide icons or approved product assets?
- Are styles scoped and free of unnecessary deep selectors?
- Do all new CSS tokens match the existing theme keys?
- Are empty, loading, error, disabled, and keyboard states handled?
- Is every visible value backed by real state or real recorded data?
