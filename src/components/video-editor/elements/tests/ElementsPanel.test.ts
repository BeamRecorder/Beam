import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import { createComposition } from '../../composition/engine/clip-engine';
import ElementsPanel from '../ElementsPanel.vue';
import { useVideoElements } from '../useVideoElements';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => key }),
}));

const wrappers: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('ElementsPanel', () => {
  it('disables family tools during playback and enables them after pausing', async () => {
    const composition = shallowRef(createComposition([], []));
    const selectedId = ref<string | null>(null);
    const activeTab = ref('elements');
    const currentTime = ref(0);
    const isPlaying = ref(true);
    const Host = defineComponent({
      setup() {
        useVideoElements({
          composition,
          selectedId,
          activeTab,
          currentTime,
          isPlaying,
          select: vi.fn(),
          clearZoom: vi.fn(),
        });
        return () => h(ElementsPanel);
      },
    });
    const wrapper = mount(Host);
    wrappers.push(wrapper);
    const familyButtons = () =>
      wrapper
        .findAll('.element-tools button')
        .filter((button) => ['shape', 'arrow', 'text', 'drawing'].includes(button.text().trim()));

    expect(familyButtons()).toHaveLength(4);
    expect(familyButtons().every((button) => button.attributes('disabled') !== undefined)).toBe(true);

    isPlaying.value = false;
    await nextTick();

    expect(familyButtons().every((button) => button.attributes('disabled') === undefined)).toBe(true);
  });
});
