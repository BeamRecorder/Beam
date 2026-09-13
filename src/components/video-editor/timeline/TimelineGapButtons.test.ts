import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import TimelineGapButtons from './TimelineGapButtons.vue';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: string) => (key === 'removeGap' ? 'Remove gap' : key),
  }),
}));

const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 60_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `/media/${id}`,
  origin: 'project',
});

const visual = (id: string, startMs: number, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: startMs,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: 'lane',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const composition = (clips: VisualClip[]): ClipComposition => ({
  schemaVersion: 14,
  keyboardCaptionSessions: [],
  assets: clips.map((clip) => asset(clip.assetId)),
  clips,
});

type TimelineGapButtonProps = InstanceType<typeof TimelineGapButtons>['$props'];

const mountButtons = (overrides: Partial<TimelineGapButtonProps> = {}) => {
  const clips = [visual('before', 0), visual('after', 3_000)];
  return mount(TimelineGapButtons, {
    props: {
      clips,
      composition: composition(clips),
      durationMs: 10_000,
      widthPx: 1_000,
      moving: false,
      ...overrides,
    },
  });
};

describe('TimelineGapButtons', () => {
  it('renders a translated trash button for a gap at least 24 pixels wide and emits its gap', async () => {
    const wrapper = mountButtons();
    const button = wrapper.get('button[aria-label="Remove gap"]');

    expect(button.attributes('title')).toBe('Remove gap');
    expect(button.attributes('type')).toBe('button');
    expect(wrapper.findAll('.timeline-gap')).toHaveLength(1);
    expect(wrapper.get('.timeline-gap').attributes('style')).toContain('translate3d(100px');

    await button.trigger('click');

    expect(wrapper.emitted('remove')).toEqual([[{ clipIds: ['before', 'after'], startMs: 1_000, endMs: 3_000 }]]);
  });

  it('keeps the gap hit area but hides the button when its rendered width is below 24 pixels', () => {
    const wrapper = mountButtons({ widthPx: 100 });

    expect(wrapper.find('.timeline-gap').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Remove gap"]').exists()).toBe(false);
  });

  it('hides every gap action while the timeline is moving', async () => {
    const wrapper = mountButtons({ moving: true });
    expect(wrapper.find('.timeline-gap').exists()).toBe(false);

    await wrapper.setProps({ moving: false });
    expect(wrapper.find('button[aria-label="Remove gap"]').exists()).toBe(true);
  });

  it('hides a gap whose downstream lane content is locked', () => {
    const clips = [visual('before', 0), visual('locked-after', 3_000, { locked: true })];
    const wrapper = mountButtons({ clips, composition: composition(clips) });

    expect(wrapper.find('.timeline-gap').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Remove gap"]').exists()).toBe(false);
  });

  it('hides a gap when linked movement would collide on another visual lane', () => {
    const target = [
      visual('main-before', 0, { trackId: 'main-lane' }),
      visual('main-after', 3_000, { trackId: 'main-lane', groupId: 'recording' }),
    ];
    const allClips = [
      ...target,
      visual('companion-before', 1_000, { trackId: 'companion-lane' }),
      visual('companion-after', 3_000, { trackId: 'companion-lane', groupId: 'recording' }),
    ];
    const wrapper = mountButtons({ clips: target, composition: composition(allClips) });

    expect(wrapper.find('.timeline-gap').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Remove gap"]').exists()).toBe(false);
  });

  it('stops pointer and click gestures on the gap container from reaching the timeline', async () => {
    const wrapper = mountButtons();
    const action = wrapper.get('.gap-action');

    await action.trigger('pointerdown');
    await action.trigger('click');

    expect(wrapper.emitted('remove')).toBeUndefined();
  });

  it('does not render a trailing or overlapping gap action', () => {
    const clips = [visual('first', 0), visual('overlap', 500), visual('last', 1_500)];
    const wrapper = mountButtons({ clips, composition: composition(clips) });

    expect(wrapper.findAll('.timeline-gap')).toHaveLength(0);
  });
});
