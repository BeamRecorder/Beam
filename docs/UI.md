# UI Guidelines

This document defines the visual and implementation rules for the Vue renderer.

## Component system

- Reuse components from `src/components/ui/` before creating a new control.
- Extend an existing UI primitive when the behavior is shared by multiple features.
- Keep feature-specific composition in the feature folder, not in the shared UI primitives.
- Use semantic HTML and preserve keyboard access, focus visibility, disabled states, and accessible names.
- Keep interactive state in Vue components or composables; do not hide application state in CSS.

## Icons and imagery

- Use icons from `@lucide/vue` for interface icons.
- Do not create fake inline SVG icons or hand-written SVG replacements.
- Use an existing raster/vector asset only when it is a product asset, a captured asset, or a documented visual requirement—not as a replacement for a UI icon.
- Do not use placeholder artwork, fake cursor paths, random animation events, or simulated media data in production UI. Missing capture data must be represented as a clear empty/error state.

## CSS and themes

- Prefer component-scoped styles and local class names.
- Avoid deep selectors (`:deep`, `::v-deep`, or equivalent) whenever possible. Use an explicit class or a component prop instead.
- Before adding a color, spacing, radius, shadow, typography, or z-index value, check whether a theme token already exists.
- Use the existing theme variables from `src/style.css` and related theme files. Do not introduce a parallel token naming system.
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

- Is the component using an existing `src/components/ui/` primitive where applicable?
- Are all icons Lucide icons or approved product assets?
- Are styles scoped and free of unnecessary deep selectors?
- Do all new CSS tokens match the existing theme keys?
- Are empty, loading, error, disabled, and keyboard states handled?
- Is every visible value backed by real state or real recorded data?
