import { enableAutoUnmount, mount } from '@vue/test-utils';
import { CircleDashed, Focus, Lock } from '@lucide/vue';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimelineCanvasClip from '../TimelineCanvasClip.vue';
import type { BlurClip } from '@beam/engine/shared/composition-types';

vi.mock('../composables/useTimelineCanvasArtwork', () => ({ useTimelineCanvasArtwork: () => ({ error: ref('') }) }));
enableAutoUnmount(afterEach);
const blurClip = (mode: BlurClip['mode'], overrides: Partial<BlurClip> = {}): BlurClip => ({
  id: 'effect',
  kind: 'blur',
  name: 'Effect',
  assetId: '',
  trackId: 'effects',
  timelineStartMs: 0,
  timelineDurationMs: 2000,
  sourceInMs: 0,
  sourceDurationMs: 2000,
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
const create = (clip: BlurClip) =>
  mount(TimelineCanvasClip, { props: { clip, duration: 10, thumbnailSlots: [], selected: true } });

describe('canvas clip effect semantics', () => {
  it.each([
    { mode: 'highlight', icon: Focus, other: CircleDashed },
    { mode: 'blur', icon: CircleDashed, other: Focus },
    { mode: 'pixelated', icon: CircleDashed, other: Focus },
  ] as const)(
    'retains the genuine $mode icon and accessible effect target without an old miniature DOM renderer',
    ({ mode, icon, other }) => {
      const wrapper = create(blurClip(mode));
      expect(wrapper.findComponent(icon).exists()).toBe(true);
      expect(wrapper.findComponent(other).exists()).toBe(false);
      expect(wrapper.get('button').attributes('aria-label')).toBe('Effect');
      expect(wrapper.find('.transition-zone').exists()).toBe(false);
    },
  );
  it('updates the effect icon without losing selected, locked or disabled state', async () => {
    const wrapper = create(blurClip('highlight', { locked: true, enabled: false }));
    expect(wrapper.get('button').classes()).toEqual(expect.arrayContaining(['selected', 'disabled']));
    expect(wrapper.findComponent(Lock).exists()).toBe(true);
    const button = wrapper.get('button').element;
    await wrapper.setProps({ clip: blurClip('pixelated', { locked: true, enabled: false }) });
    expect(wrapper.get('button').element).toBe(button);
    expect(wrapper.findComponent(CircleDashed).exists()).toBe(true);
    expect(wrapper.findComponent(Focus).exists()).toBe(false);
    expect(wrapper.findComponent(Lock).exists()).toBe(true);
    expect(wrapper.get('button').classes()).toEqual(expect.arrayContaining(['selected', 'disabled']));
  });
});
