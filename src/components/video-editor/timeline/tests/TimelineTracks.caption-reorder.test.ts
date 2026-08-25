import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { CaptionClip, TextCaptionData } from '~/media/shared/composition-types';
import { composition, keyboardCaption, mountTracks, pointerEvent } from './TimelineTracks.test-support';

type TextCaptionClip = Omit<CaptionClip, 'caption'> & { caption: TextCaptionData };

const withMultiClipAiCaption = () => {
  const base = composition();
  const aiCaption = base.clips.find((clip): clip is CaptionClip => clip.id === 'caption-clip');
  if (!aiCaption || aiCaption.caption.type !== 'text') throw new Error('Expected the base AI caption clip.');
  const first: TextCaptionClip = {
    ...aiCaption,
    captionLayerId: 'ai-caption-layer',
    caption: {
      ...aiCaption.caption,
      sentences: [{ id: 'first', text: 'First sentence', startMs: 5_000, endMs: 6_000, words: [] }],
    },
  };
  const second: TextCaptionClip = {
    ...first,
    id: 'caption-clip-2',
    name: 'AI Caption 2',
    order: first.order + 1,
    timelineStartMs: first.timelineStartMs + first.timelineDurationMs,
    sourceDurationMs: first.sourceDurationMs,
    caption: {
      ...first.caption,
      sentences: [{ id: 'second', text: 'Second sentence', startMs: 7_000, endMs: 8_000, words: [] }],
    },
  };
  return {
    ...base,
    clips: [...base.clips.filter((clip) => clip.id !== aiCaption.id), first, second],
  };
};

const withGroupedAiAndManualTextCaptions = () => {
  const grouped = withMultiClipAiCaption();
  const aiCaption = grouped.clips.find((clip): clip is CaptionClip => clip.id === 'caption-clip');
  if (!aiCaption || aiCaption.caption.type !== 'text') throw new Error('Expected the grouped AI caption clip.');
  const manual: CaptionClip = {
    ...aiCaption,
    id: 'manual-caption',
    name: 'Manual caption',
    order: aiCaption.order + 2,
    isAiGenerated: false,
    captionLayerId: undefined,
    timelineStartMs: aiCaption.timelineStartMs + aiCaption.timelineDurationMs * 2,
    caption: {
      ...aiCaption.caption,
      style: { ...aiCaption.caption.style, customText: 'Manual caption' },
      sentences: [],
    },
  };
  return { ...grouped, clips: [...grouped.clips, manual] };
};

const withManualTextCaptions = () => {
  const base = composition();
  const first = base.clips.find((clip): clip is CaptionClip => clip.id === 'caption-clip');
  if (!first) throw new Error('Expected the base text caption clip.');

  const manualFirst: CaptionClip = { ...first, isAiGenerated: false };
  const manualSecond: CaptionClip = {
    ...manualFirst,
    id: 'caption-clip-2',
    name: 'Second caption',
    order: first.order + 1,
    timelineStartMs: first.timelineStartMs + first.timelineDurationMs,
    caption: {
      ...manualFirst.caption,
      style: { ...manualFirst.caption.style, customText: 'Second caption' },
    },
  };

  return {
    ...base,
    clips: [...base.clips.filter((clip) => clip.id !== first.id), manualFirst, manualSecond],
  };
};

const installElementFromPoint = () => {
  const elementFromPoint = vi.fn<NonNullable<typeof document.elementFromPoint>>();
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: elementFromPoint,
  });
  return elementFromPoint;
};

describe('TimelineTracks text caption layers', () => {
  it('renders phrase clips sharing one AI layer as one row with multiple buttons', async () => {
    const mounted = await mountTracks({ composition: withMultiClipAiCaption() });

    const timelineRows = mounted!.findAll('.tracks-stack .text-caption-layer');
    const sidebarRows = mounted!.findAll('.sidebar-tracks-stack .text-caption-layer');

    expect(timelineRows).toHaveLength(1);
    expect(sidebarRows).toHaveLength(1);
    expect(timelineRows[0]!.attributes('data-caption-id')).toBe('caption-layer:ai-caption-layer');
    expect(sidebarRows[0]!.attributes('data-caption-id')).toBe('caption-layer:ai-caption-layer');
    expect(timelineRows[0]!.findAll('button.annotation-indicator')).toHaveLength(2);
    expect(timelineRows[0]!.findAll('button.annotation-indicator').map((button) => button.text())).toEqual([
      expect.stringContaining('First sentence'),
      expect.stringContaining('Second sentence'),
    ]);
  });

  it('keeps manual text captions in individual timeline and sidebar layers', async () => {
    const mounted = await mountTracks({ composition: withManualTextCaptions() });

    const timelineRows = mounted!.findAll('.tracks-stack .text-caption-layer');
    const sidebarRows = mounted!.findAll('.sidebar-tracks-stack .text-caption-layer');

    expect(timelineRows).toHaveLength(2);
    expect(sidebarRows).toHaveLength(2);
    expect(timelineRows.map((row) => row.attributes('data-caption-id'))).toEqual([
      'caption-clip:caption-clip',
      'caption-clip:caption-clip-2',
    ]);
    expect(sidebarRows.map((row) => row.attributes('data-caption-id'))).toEqual([
      'caption-clip:caption-clip',
      'caption-clip:caption-clip-2',
    ]);
  });

  it('emits one reorder for the representative when dragging a grouped AI layer', async () => {
    const mounted = await mountTracks({ composition: withGroupedAiAndManualTextCaptions() });
    const elementFromPoint = installElementFromPoint();
    const sidebarRows = mounted!.findAll('.sidebar-tracks-stack .text-caption-layer');
    expect(sidebarRows).toHaveLength(2);
    elementFromPoint.mockReturnValue(sidebarRows[1]!.element);

    await sidebarRows[0]!.get('.track-info').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointermove', 30, 100));
    window.dispatchEvent(pointerEvent('pointerup', 30, 100));
    await flushPromises();

    expect(mounted!.emitted('reorder:caption')).toContainEqual([{ id: 'caption-clip', targetIndex: 1 }]);
  });

  it('emits a caption reorder with the target caption index', async () => {
    const mounted = await mountTracks({ composition: withManualTextCaptions() });
    const elementFromPoint = installElementFromPoint();
    const sidebarRows = mounted!.findAll('.sidebar-tracks-stack .text-caption-layer');
    elementFromPoint.mockReturnValue(sidebarRows[1]!.element);

    await sidebarRows[0]!.get('.track-info').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointermove', 30, 100));
    window.dispatchEvent(pointerEvent('pointerup', 30, 100));
    await flushPromises();

    expect(mounted!.emitted('reorder:caption')).toContainEqual([{ id: 'caption-clip', targetIndex: 1 }]);
    expect(mounted!.emitted('reorder:clip') ?? []).toHaveLength(0);
  });

  it('does not reorder a caption when the pointer is over a visual, audio, or keyboard row', async () => {
    const mounted = await mountTracks({
      composition: {
        ...withManualTextCaptions(),
        clips: [...withManualTextCaptions().clips, keyboardCaption()],
      },
    });
    const elementFromPoint = installElementFromPoint();
    const textRow = mounted!.find('.sidebar-tracks-stack .text-caption-layer');
    const targets = [
      mounted!.find('.sidebar-tracks-stack .visual-track'),
      mounted!.find('.sidebar-tracks-stack .audio-track'),
      mounted!.find('.sidebar-tracks-stack .keyboard-caption-track'),
    ];

    for (const target of targets) {
      elementFromPoint.mockReturnValue(target.element);
      await textRow.get('.track-info').trigger('pointerdown', { clientX: 10, clientY: 10 });
      window.dispatchEvent(pointerEvent('pointermove', 30, 100));
      window.dispatchEvent(pointerEvent('pointerup', 30, 100));
      await flushPromises();
    }

    expect(elementFromPoint).toHaveBeenCalled();
    expect(mounted!.emitted('reorder:caption') ?? []).toHaveLength(0);
  });

  it('keeps a placeholder text-caption row when there are no text captions', async () => {
    const base = composition();
    const mounted = await mountTracks({
      composition: { ...base, clips: base.clips.filter((clip) => clip.id !== 'caption-clip') },
    });

    expect(mounted!.findAll('.tracks-stack .text-caption-layer')).toHaveLength(0);
    expect(mounted!.findAll('.tracks-stack .text-caption-track')).toHaveLength(1);
    expect(mounted!.find('.sidebar-tracks-stack .text-caption-track .static-info').text()).toContain('Text Captions');
  });
});
