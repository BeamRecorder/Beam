import { mount } from '@vue/test-utils';
import { CircleDashed, Focus } from '@lucide/vue';
import { computed, reactive, type Ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineClip from '../TimelineClip.vue';
import type { BlurClip } from '~/media/shared/composition-types';

const thumbnailState = vi.hoisted(() => ({
  thumbnails: {} as Record<number, string>,
  thumbnailsRef: null as unknown as Ref<Record<number, string>>,
  requestVisibleFrames: vi.fn(),
}));

vi.mock('../waveform/useThumbnails', () => ({
  useThumbnails: () => ({
    thumbnails: thumbnailState.thumbnailsRef,
    requestVisibleFrames: thumbnailState.requestVisibleFrames,
  }),
}));

const blurClip = (mode: BlurClip['mode'], overrides: Partial<BlurClip> = {}): BlurClip => ({
  id: 'effect-clip',
  kind: 'blur',
  name: 'Effect',
  assetId: '',
  trackId: 'effect-track',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  shape: 'rectangle',
  mode,
  strength: 40,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
  ...overrides,
});

const mountEffect = (clip: BlurClip) =>
  mount(TimelineClip, {
    props: {
      clip,
      asset: null,
      duration: 10,
      thumbnailSlots: [],
      selected: true,
    },
  });

beforeEach(() => {
  thumbnailState.thumbnails = reactive<Record<number, string>>({});
  thumbnailState.thumbnailsRef = computed(() => thumbnailState.thumbnails);
  thumbnailState.requestVisibleFrames.mockClear();
});

describe('TimelineClip effect styling', () => {
  it.each([
    { mode: 'highlight', kindClass: 'kind-highlight', label: 'Highlight', icon: Focus, otherIcon: CircleDashed },
    { mode: 'blur', kindClass: 'kind-blur', label: 'Blur', icon: CircleDashed, otherIcon: Focus },
  ] as const)(
    'distinguishes the $mode clip class and accessible icon',
    ({ mode, kindClass, label, icon, otherIcon }) => {
      const wrapper = mountEffect(blurClip(mode));
      const timelineClip = wrapper.get('.timeline-clip');
      const iconElement = wrapper.get('.clip-kind-icon');

      expect(timelineClip.classes()).toContain(kindClass);
      expect(timelineClip.classes()).not.toContain(kindClass === 'kind-highlight' ? 'kind-blur' : 'kind-highlight');
      expect(iconElement.attributes('role')).toBe('img');
      expect(iconElement.attributes('aria-label')).toBe(label);
      expect(wrapper.findComponent(icon).exists()).toBe(true);
      expect(wrapper.findComponent(otherIcon).exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it('reacts to mode changes while retaining selection, lock, and disabled state', async () => {
    const lockedDisabledClip = (mode: BlurClip['mode']) => blurClip(mode, { locked: true, enabled: false });
    const wrapper = mountEffect(lockedDisabledClip('highlight'));
    const timelineClip = wrapper.get('.timeline-clip');

    expect(timelineClip.classes()).toEqual(expect.arrayContaining(['selected', 'disabled', 'kind-highlight']));
    expect(wrapper.find('.timeline-lock-overlay').exists()).toBe(true);
    expect(wrapper.get('.clip-kind-icon').attributes('aria-label')).toBe('Highlight');
    expect(wrapper.findComponent(Focus).exists()).toBe(true);

    await wrapper.setProps({ clip: lockedDisabledClip('pixelated') });
    expect(timelineClip.classes()).toEqual(expect.arrayContaining(['selected', 'disabled', 'kind-blur']));
    expect(timelineClip.classes()).not.toContain('kind-highlight');
    expect(wrapper.find('.timeline-lock-overlay').exists()).toBe(true);
    expect(wrapper.get('.clip-kind-icon').attributes('aria-label')).toBe('Blur');
    expect(wrapper.findComponent(CircleDashed).exists()).toBe(true);
    expect(wrapper.findComponent(Focus).exists()).toBe(false);

    await wrapper.setProps({ clip: lockedDisabledClip('highlight') });
    expect(timelineClip.classes()).toEqual(expect.arrayContaining(['selected', 'disabled', 'kind-highlight']));
    expect(wrapper.get('.clip-kind-icon').attributes('aria-label')).toBe('Highlight');
    expect(wrapper.findComponent(Focus).exists()).toBe(true);
    wrapper.unmount();
  });
});
