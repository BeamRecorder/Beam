import type { CursorStyle } from '../shared/generated/editorContracts';

/** Rust materializes saved profile defaults before exposing them to the inspector. */
export function cursorControlStyle(style: CursorStyle): Required<CursorStyle> {
  const { selection, shadow, motion, clickEffects, fadeDurationMs } = style;
  if (!selection || !shadow || !motion || !clickEffects || fadeDurationMs === undefined) {
    throw new Error('The engine returned an incomplete cursor profile');
  }
  return { ...style, selection, shadow, motion, clickEffects, fadeDurationMs };
}
