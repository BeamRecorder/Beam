import type { Clip } from '~/media/shared/composition-types';

export function isVideoElementClip(clip: Clip | null | undefined): boolean {
  if (!clip) return false;
  if (clip.kind === 'shape' || clip.kind === 'image' || clip.kind === 'color' || clip.kind === 'blur') return true;
  return clip.kind === 'caption' && clip.caption.type === 'text' && clip.caption.style.customText !== undefined;
}
