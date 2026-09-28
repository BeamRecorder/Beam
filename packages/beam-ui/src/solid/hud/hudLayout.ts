export const hudLimits = { minWidth: 440, minHeight: 208, maxWidth: 680, maxHeight: 252 } as const

/** Layout values at each native HUD width; the capture cards remain reachable. */
export function hudLayout(width: number, height: number) {
  const w = Math.max(hudLimits.minWidth, Math.min(hudLimits.maxWidth, width))
  const h = Math.max(hudLimits.minHeight, Math.min(hudLimits.maxHeight, height))
  const deviceWidth = Math.round(132 + (w - 440) * 52 / 240)
  const sourceWidth = w - deviceWidth - 33
  const cardWidth = Math.min(144, (sourceWidth - 16) / 3)
  const showModeLabels = w >= 500
  return { showModeLabels, showBrandLabel: w >= 500, deviceWidth,
    modeGroupWidth: showModeLabels ? Math.min(336, sourceWidth) : 126,
    cardHeight: Math.min(h - 111, (cardWidth - 12) * 9 / 16 + 35) }
}
