import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import SelectionIndicator from './SelectionIndicator.vue';

const style = parse(readFileSync('src/components/ui/transitions/SelectionIndicator.vue', 'utf8')).descriptor.styles[0]!
  .content;

describe('shared selection motion', () => {
  it('uses the Recorder timing on a decorative element that cannot intercept clicks', () => {
    const wrapper = mount(SelectionIndicator);
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.classes()).not.toContain('is-instant');
    expect(style).toContain('transform 240ms cubic-bezier(0.22, 1, 0.36, 1)');
    expect(style).toContain('pointer-events: none');
    wrapper.unmount();
  });

  it('can snap to layout changes and resume selection movement on the same element', async () => {
    const wrapper = mount(SelectionIndicator, { props: { instant: true } });
    const indicator = wrapper.element;
    expect(wrapper.classes()).toContain('is-instant');
    expect(style).toMatch(/\.selection-indicator\.is-instant\s*\{\s*transition: none;/);
    await wrapper.setProps({ instant: false });
    expect(wrapper.classes()).not.toContain('is-instant');
    expect(wrapper.element).toBe(indicator);
    wrapper.unmount();
  });

  it('disables selection movement when reduced motion is requested', () => {
    expect(style).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.selection-indicator\s*\{\s*transition: none;/,
    );
  });
});
