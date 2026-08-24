import type { CaptionClip, CaptionStyle, ClipComposition } from '~/media/shared/composition-types';
import { updateClip } from './engine/clip-engine';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const changedSharedStyle = (current: CaptionStyle, updated: CaptionStyle): Partial<CaptionStyle> =>
  Object.fromEntries(
    (Object.keys(updated) as Array<keyof CaptionStyle>)
      .filter((key) => key !== 'customText' && !same(current[key], updated[key]))
      .map((key) => [key, clone(updated[key])]),
  ) as Partial<CaptionStyle>;

export function applyCaptionSelectionUpdate(
  composition: ClipComposition,
  selectedClipIds: readonly string[],
  updatedPrimary: CaptionClip,
): ClipComposition {
  const currentPrimary = composition.clips.find(
    (clip): clip is CaptionClip => clip.id === updatedPrimary.id && clip.kind === 'caption',
  );
  if (!currentPrimary) return composition;

  const selected = new Set(selectedClipIds);
  const stylePatch = changedSharedStyle(currentPrimary.caption.style, updatedPrimary.caption.style);
  const transformChanged = !same(currentPrimary.transform, updatedPrimary.transform);
  let next = updateClip(composition, updatedPrimary.id, () => clone(updatedPrimary));

  for (const clip of composition.clips) {
    if (clip.id === updatedPrimary.id || clip.kind !== 'caption' || clip.caption.type !== currentPrimary.caption.type)
      continue;
    const sharesCaptionLayer =
      currentPrimary.captionLayerId !== undefined && clip.captionLayerId === currentPrimary.captionLayerId;
    if (!selected.has(clip.id) && !sharesCaptionLayer) continue;
    next = updateClip(next, clip.id, (target) => {
      if (target.kind !== 'caption') return target;
      const updated = {
        ...target,
        caption: {
          ...target.caption,
          style: { ...target.caption.style, ...clone(stylePatch) },
        },
      } satisfies CaptionClip;
      if (!transformChanged) return updated;
      if (updatedPrimary.transform) return { ...updated, transform: clone(updatedPrimary.transform) };
      const { transform: _transform, ...withoutTransform } = updated;
      return withoutTransform;
    });
  }
  return next;
}
