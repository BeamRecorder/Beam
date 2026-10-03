# UI Guidelines

This document defines the visual and implementation rules for the Vue renderer.

## Component system

- Reuse components from `apps/desktop/src/components/ui/` before creating a new control.
- Extend an existing UI primitive when the behavior is shared by multiple features.
- Keep feature-specific composition in the feature folder, not in the shared UI primitives.
- Use semantic HTML and preserve keyboard access, focus visibility, disabled states, and accessible names.
- Keep interactive state in Vue components or composables; do not hide application state in CSS.
- Keep ordinary button and select hover/open surfaces neutral, including their borders and text. Reserve the accent for primary actions and selected navigation or choices; retain a visible neutral keyboard-focus outline.
- `ButtonGroup` uses `variant="primary"` by default for accent-colored selections. Use `variant="neutral"` for neutral selections. Both variants keep unselected hover states neutral and use the theme's matching selected-text color.
- Single-choice groups use `selection="{ index, count }"` for the Recorder's sliding indicator; both `tab` and `selected` buttons share this surface. Keep multi-choice style toggles independent.
- `SelectionIndicator` shares the Recorder's movement timing and reduced-motion behavior between button groups and editor sidebars. Sidebars measure the selected button across menu separators and the Settings footer; scroll and resize updates position it instantly.
- `Select` hides preview eyes by default. Opt into `showPreviewIndicator` only where `preview:modelValue` drives a visible preview; device and other choice-only menus keep it disabled.

The shared `CommandPalette` composes editor Spotlight views with fixed-height virtual rows and `ScrollShadow`. Use `Button`'s `contentLayout="custom"` for structured rows, keeping label, metadata and chevron in explicit aligned cells. Search inputs use the rounded neutral appearance. Animate height and category changes only; typing and thumbnail completion must retain the list surface. Respect reduced motion and keep mouse Back/Forward navigation inside the palette. Domain adapters supply real editor actions and visible-row thumbnail requests.

Shared settings use `SettingsSection` for category headings and `TogglePreference` for consistent option labels, descriptions and accessible switches. Recorder and editor appearance choices reuse `ThemeModePicker`; System shows both palettes with a localized explanation. Theme Advanced contains colors/style only. Scaling keeps its global slider visible and reveals per-area overrides separately.

Theme choice previews keep a 3:2 aspect ratio and scale their miniature geometry with the card's container, not just its width. Cap the choice group at 36rem so maximized settings windows keep readable previews; the same group must still fit the compact editor inspector.

Screenshot layer naming reuses `Input`: single-click the selected layer title in the left inspector header, or double-click/F2 in Composition. Do not add a separate name field in the properties body. Enter or blur commits a name, Escape cancels, and inline editing restores the initiating control's focus only for keyboard completion. Names describe layers without changing text rendered on the canvas.

Editor startup uses the same `EditorWorkspace`, preview geometry and layout tokens as the live screenshot/video editors. The shared skeleton surface measures inert presentational controls rather than inventing their sizes, and the Canvas inspector reuses `CanvasPanelLayout` without starting media or preference requests. Preserve UI scale and saved timeline height; do not show a video timeline in Screenshot or guess an output aspect ratio before metadata is available. Loading surfaces start opaque, respect reduced motion and release observers/frames on disposal.

Advanced disclosures use `ui/transitions/RafRevealTransition.vue`. It measures geometry once, batches style writes per animation frame, preserves the current size on reversal and cancels work on unmount. Its default vertical axis reveals advanced controls; use `axis="horizontal"` for collapsible inspectors. Keep the content unscaled, preserve reduced motion, and use the same transition for opening and closing.

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

## Visual behavior

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
