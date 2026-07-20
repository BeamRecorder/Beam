# Workspace Rules

## UI Development Guidelines

- **Always Reuse Existing UI Components**: When building or modifying interfaces, always import and use the pre-existing custom UI components located in [src/components/ui/](file:///c:/Users/binos/Documents/Personal_project/OSS/DemoRecorder/demo-recorder/demo-recorder/src/components/ui/) (e.g., `Button`, `Popover`, `Select`, `Dialog`, `Input`, `Switch`, `Slider`, `Badge`) rather than writing custom ad-hoc controls or styling.
- **Maintain Consistent Aesthetics**: Follow the design language defined in [style.css](file:///c:/Users/binos/Documents/Personal_project/OSS/DemoRecorder/demo-recorder/demo-recorder/src/style.css) and the existing components to prevent UI inconsistency.
- DO NOT USE :deep selectors EVEN IF NEEDED.