import type { CaptionStyle, Clip } from '@beam/engine/shared/composition-types';

export function clipTextStyles(clips: readonly Clip[]): CaptionStyle[] {
  return clips.flatMap((clip) =>
    clip.kind === 'caption' ? [clip.caption.style] : clip.kind === 'shape' && clip.text ? [clip.text.style] : [],
  );
}
