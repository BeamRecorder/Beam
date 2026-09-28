/** Concat's light/dark design values, with Beam's orange supplied separately.
 * Reference: github.com/jub0t/Concat/tree/8ee0d36a5bd1d6e2f6497ced7e85e84057821a95/src/crates/concat/ui/theme
 */
export const beamPalettes = {
  light: {
    page: '#d2d2d9', panel: '#f7f7f8', raised: '#ffffff', well: '#dfdfe4',
    field: '#f0f0f2', fieldHover: '#e8e8ec', fieldActive: '#d6d6dd',
    line: '#d9d9da', lineStrong: '#c8c8c9',
    foreground: '#16161a', muted: '#56565e', dim: '#86868c', hot: '#000000',
    danger: '#d70015', dangerSoft: '#d7001524', dangerWash: '#fbe8e6', overlayTint: '#00000059',
    charts: ['#306cc1', '#1f8a4b', '#8a58b3', '#bb538c', '#5a4fd1'],
  },
  dark: {
    page: '#151517', panel: '#212123', raised: '#2b2b2e', well: '#19191b',
    field: '#323235', fieldHover: '#3b3b3e', fieldActive: '#46464a',
    line: '#373739', lineStrong: '#555557',
    foreground: '#f5f5f7', muted: '#a1a1a6', dim: '#6e6e73', hot: '#ffffff',
    danger: '#ff453a', dangerSoft: '#ff453a24', dangerWash: '#2a1614', overlayTint: '#00000099',
    charts: ['#3373d1', '#34c46f', '#9f63d6', '#cf5a99', '#6d63e8'],
  },
} as const
