import type { CaptionClip, Clip, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { TimelineClipboardDescriptor } from './timeline-clipboard-types';

const MAX_CAPTION_LABEL_LENGTH = 72;

const compactText = (value: string) => value.replace(/\s+/g, ' ').trim();

const truncateText = (value: string) => {
  const characters = Array.from(compactText(value));
  if (characters.length <= MAX_CAPTION_LABEL_LENGTH) return characters.join('');
  return `${characters.slice(0, MAX_CAPTION_LABEL_LENGTH - 1).join('')}…`;
};

const captionText = (clip: CaptionClip) => {
  const customText = compactText(clip.caption.style.customText ?? '');
  if (customText) return truncateText(customText);
  if (clip.caption.type === 'text') {
    const sentences = compactText(clip.caption.sentences.map((sentence) => sentence.text).join(' '));
    if (sentences) return truncateText(sentences);
  } else {
    const keys = compactText(
      clip.caption.steps
        .map((step) => (step.modifiers.length ? `${step.modifiers.join('+')}+${step.key}` : step.key))
        .join(' '),
    );
    if (keys) return truncateText(keys);
  }
  return truncateText(clip.name);
};

export const describeClipboardClip = (
  clip: Clip,
  asset: MediaAsset | null,
): Exclude<TimelineClipboardDescriptor, { kind: 'zoom' }> => {
  if (clip.kind === 'caption') return { kind: 'caption', text: captionText(clip) };
  const name = compactText(asset?.fileName ?? '') || compactText(clip.name) || compactText(asset?.name ?? '');
  return { kind: 'item', name };
};

export const describeClipboardZoom = (
  zoom: ZoomElement,
  zoomElements: ZoomElement[],
): Extract<TimelineClipboardDescriptor, { kind: 'zoom' }> => {
  const ordered = [...zoomElements].sort(
    (left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id),
  );
  const index = ordered.findIndex((item) => item.id === zoom.id);
  return { kind: 'zoom', number: index + 1 };
};
