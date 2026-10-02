import { useTranslate } from '~/i18n/useTranslate';
import type { TimelineAddableVisualKind } from '../../composition/visual-element-types';

export function useTimelineVisualLabels() {
  const { t } = useTranslate('TimelineTracks');
  const { t: canvas } = useTranslate('CanvasPanel');
  const { t: toolbar } = useTranslate('TimelineToolbar');
  const { t: highlight } = useTranslate('Highlight');
  return (kind: TimelineAddableVisualKind | null) => {
    const label =
      kind === 'highlight'
        ? highlight('title')
        : kind === 'color'
          ? canvas('color')
          : kind === 'shape'
            ? canvas('shapesAndArrows')
            : kind === 'blur'
              ? t('blur')
              : kind === 'image'
                ? canvas('image')
                : '';
    return `${toolbar('add')} ${label}`;
  };
}
