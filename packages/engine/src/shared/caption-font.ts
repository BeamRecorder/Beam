import type { CaptionStyle } from '@beam/engine/shared/composition-types';

export const canvasCaptionFont = (style: CaptionStyle, fontSize = style.fontSize) => {
  const rawFamily = style.fontFamily || 'sans-serif';
  const family = rawFamily.includes(' ') ? `"${rawFamily.replaceAll('"', '')}"` : rawFamily;
  return `${style.fontStyle ?? 'normal'} ${style.fontWeight ?? 800} ${Math.max(1, fontSize)}px ${family}`;
};
