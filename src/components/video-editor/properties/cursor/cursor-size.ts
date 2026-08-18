export const CURSOR_SIZE_MIN = 16;
export const CURSOR_SIZE_MAX = 128;
export const CURSOR_SIZE_DEFAULT = 45;

export const clampCursorSize = (value: number) =>
  Math.min(CURSOR_SIZE_MAX, Math.max(CURSOR_SIZE_MIN, Math.round(value)));
