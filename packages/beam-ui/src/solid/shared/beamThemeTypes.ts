import type { WidgetTheme } from '@argui/widgets/solid'

/** Native window colors in addition to the shared widget roles. */
export interface BeamTheme extends WidgetTheme {
  overlayTint: string
}
