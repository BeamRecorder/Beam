import { defineComponent, h } from 'vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import { useTimelineVisualLabels } from '../useTimelineVisualLabels';

enableAutoUnmount(afterEach);
const labels = () =>
  mount(
    defineComponent({
      setup: () => ({ label: useTimelineVisualLabels() }),
      render: () => h('div'),
    }),
  ).vm.label;

describe('useTimelineVisualLabels', () => {
  it('labels every addable visual kind without merging blur and highlight', () => {
    const label = labels();
    expect(
      ['color', 'shape', 'blur', 'image', 'highlight'].map((kind) => label(kind as Parameters<typeof label>[0])),
    ).toEqual(['Add Color', 'Add Elements', 'Add Blur', 'Add Image', 'Add Highlight']);
  });
  it('preserves the empty element label for non-addable tracks', () => {
    expect(labels()(null)).toBe('Add ');
  });
  it('uses the current language after a locale change', async () => {
    const label = labels();
    const before = label('image');
    await setCurrentLocale('fr');
    expect(label('image')).not.toBe(before);
    expect(label('image')).not.toContain('CanvasPanel.');
  });
});
