export type TeleprompterMode = 'continuous' | 'line-by-line'
export type TeleprompterTextAlign = 'left' | 'center'
export type TeleprompterTheme = 'system' | 'light' | 'dark'
export const TELEPROMPTER_FONT_SIZE = 36

export interface TeleprompterDocument {
  schemaVersion: 1
  text: string
  mode: TeleprompterMode
  autoscroll: boolean
  scrollSpeed: number
  fontSize: number
  lineHeight: number
  textAlign: TeleprompterTextAlign
  theme: TeleprompterTheme
  updatedAtUtc: string
}

export type TeleprompterSettings = Pick<
  TeleprompterDocument,
  'mode' | 'autoscroll' | 'scrollSpeed' | 'fontSize' | 'lineHeight' | 'textAlign'
>

export interface TeleprompterSessionContext {
  projectId: string
  sessionId: string
}

export type TeleprompterShortcutId =
  | 'teleprompter.toggleVisibility'
  | 'teleprompter.toggleAutoscroll'
  | 'teleprompter.nextLine'
  | 'teleprompter.previousLine'

export const TELEPROMPTER_DEFAULTS: Omit<TeleprompterDocument, 'updatedAtUtc'> = {
  schemaVersion: 1,
  text: '',
  mode: 'continuous',
  autoscroll: true,
  scrollSpeed: 42,
  fontSize: TELEPROMPTER_FONT_SIZE,
  lineHeight: 1.35,
  textAlign: 'left',
  theme: 'system',
}

export const createDefaultTeleprompterDocument = (now = new Date().toISOString()): TeleprompterDocument => ({
  ...TELEPROMPTER_DEFAULTS,
  updatedAtUtc: now,
})

export const splitTeleprompterLines = (text: string): string[] => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  return lines.length > 0 ? lines : ['']
}

export const clampTeleprompterLine = (index: number, lineCount: number): number => {
  if (lineCount <= 0) return 0
  return Math.max(0, Math.min(Math.trunc(index), lineCount - 1))
}
