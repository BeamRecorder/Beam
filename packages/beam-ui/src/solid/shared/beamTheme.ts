import type { ThemeDefinition, ThemeRuntime } from '@argui/host'
import { widgetThemeDefinition, type WidgetTheme } from '@argui/widgets/solid'
import type { BeamApi } from './beamApi'
import { beamPalettes } from './beamPalette'
import type { BeamTheme } from './beamThemeTypes'

const accent = {
  primary: '#ea580c', primaryForeground: '#ffffff', primaryHover: '#c2410c',
  ring: '#f97316', focusRing: '#f97316', sidebarPrimary: '#ea580c',
}

/** Keeps hidden and visible scenes on the latest committed theme without polling. */
export function observeBeamTheme(api: BeamApi, runtime: ThemeRuntime<WidgetTheme>): () => void {
  let revision = 0
  let disposed = false
  void api.preferences().then(value => {
    if (!disposed && revision === 0) runtime.update({ variant: value.theme })
  }).catch(console.error)
  const off = api.onEvent(event => {
    if (event.type === 'preferencesChanged' && event.preferences) {
      revision++; runtime.update({ variant: event.preferences.theme })
    } else if (event.type === 'systemScheme' && (event.scheme === 'light' || event.scheme === 'dark')) {
      runtime.update({ systemScheme: event.scheme })
    }
  })
  return () => { disposed = true; off() }
}

/** Maps the same Concat surface ladder onto every native widget role. */
function variant(name: 'light' | 'dark'): BeamTheme {
  const colors = beamPalettes[name]
  return {
    ...widgetThemeDefinition.variants![name] as WidgetTheme, ...accent,
    background: colors.panel, foreground: colors.foreground,
    card: colors.raised, cardForeground: colors.foreground,
    popover: colors.raised, popoverForeground: colors.foreground,
    secondary: colors.field, secondaryForeground: colors.foreground,
    secondaryHover: colors.fieldHover, muted: colors.well, mutedForeground: colors.muted,
    accent: colors.fieldActive, accentForeground: colors.foreground,
    destructive: colors.danger, danger: colors.danger,
    destructiveSurface: colors.dangerSoft, destructiveHover: colors.dangerWash,
    border: colors.line, input: colors.lineStrong,
    surface: colors.field, surfaceHover: colors.fieldActive, controlHover: colors.fieldHover,
    text: colors.foreground, textMuted: colors.muted,
    ghostHover: colors.field,
    outlineSurface: colors.field, outlineBorder: colors.lineStrong, outlineHover: colors.fieldHover,
    sidebar: colors.well, sidebarForeground: colors.foreground,
    sidebarPrimaryForeground: accent.primaryForeground,
    sidebarAccent: colors.fieldActive, sidebarAccentForeground: colors.foreground,
    sidebarBorder: colors.line, sidebarRing: accent.ring,
    chart1: colors.charts[0], chart2: colors.charts[1], chart3: colors.charts[2],
    chart4: colors.charts[3], chart5: colors.charts[4], overlayTint: colors.overlayTint,
    radius: 7, spacing: 6, inputHeight: 28, inputGroupHeight: 28, inputLineHeight: 20,
    fieldLabelSize: 11, selectCompactHeight: 28, selectRowHeight: 26, selectCompactRowHeight: 26,
    selectMaxPopupHeight: 240,
    overlaySurface: colors.raised, overlayBlur: 0, overlayRadius: 7, overlayPadding: 14,
    overlayShadowColor: name === 'dark' ? '#00000080' : '#00000024',
  }
}

/** Concat light/dark colors and metrics, keeping Beam's orange action color. */
export const beamThemeDefinition: ThemeDefinition<BeamTheme> = {
  ...widgetThemeDefinition,
  tokens: { ...widgetThemeDefinition.tokens, overlayTint: { type: 'Color', default: beamPalettes.light.overlayTint, impact: 'Paint' } },
  variants: {
    light: variant('light'),
    dark: variant('dark'),
  },
}
