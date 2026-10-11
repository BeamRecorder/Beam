import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SourcePicker from './SourcePicker.vue';
import { developmentSources } from './development-sources';
import type { SourcePickerState } from '~/api/types/source-picker';

enableAutoUnmount(afterEach);
const stateFor = (kind: SourcePickerState['kind']): SourcePickerState => {
  const sources = developmentSources.filter((source) => source.kind === kind).slice(0, 2);
  return { kind, sources, selectedId: sources[0]!.id, highlightedId: null, development: true, error: null };
};

describe('SourcePicker labelled cards', () => {
  it.each(['screen', 'window'] as const)('shows %s names and icons without a redundant native hint', async (kind) => {
    const state = stateFor(kind);
    const wrapper = mount(SourcePicker, { props: { state, browserPreview: true } });
    const cards = wrapper.findAll('.source-card');
    expect(cards).toHaveLength(2);
    for (const [index, card] of cards.entries()) {
      expect(card.attributes('title')).toBeUndefined();
      expect(card.get('.source-label strong').text()).toBe(state.sources[index]!.name);
      expect(card.find('.source-label svg, .source-label img').exists()).toBe(true);
      expect(card.attributes('aria-label')).toContain(state.sources[index]!.name);
    }
    expect(wrapper.find('.tooltip-wrapper').exists()).toBe(false);
    await cards[1]!.trigger('click');
    expect(wrapper.emitted('action')).toEqual([[{ type: 'select', id: state.sources[1]!.id }], [{ type: 'confirm' }]]);
  });

  it('retains the full accessible source name and keyboard confirmation for a long label', async () => {
    const state = stateFor('window');
    state.sources = [{ ...state.sources[0]!, name: 'A long document name that exceeds the compact source card width' }];
    const wrapper = mount(SourcePicker, { props: { state, browserPreview: true } });
    const card = wrapper.get('.source-card');
    expect(card.attributes('aria-label')).toContain(state.sources[0]!.name);
    expect(card.attributes('title')).toBeUndefined();
    await card.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('action')).toEqual([[{ type: 'select', id: state.sources[0]!.id }], [{ type: 'confirm' }]]);
  });
});
