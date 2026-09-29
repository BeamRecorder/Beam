import type { TeleprompterDocument } from './teleprompterTypes'

/** Old default-white scripts follow the theme; explicitly chosen colors retain their alpha. */
export function resolvedTextColor(document: Pick<TeleprompterDocument, 'textColor' | 'useThemeTextColor'>, foreground: string): string {
  const automatic = document.useThemeTextColor ?? document.textColor.toLowerCase() === '#ffffffff'
  return automatic ? foreground : document.textColor
}
