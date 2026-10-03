import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import CaptureModeIcon from '../CaptureModeIcon.vue';

describe('CaptureModeIcon', () => {
  it.each([
    ['studio', 'recorder', 'Studio'],
    ['screenshot', 'screenshot', 'Screenshot'],
    ['instant', 'instant', 'Instant'],
  ] as const)('uses the original %s SVG and its translated accessible name', (mode, asset, label) => {
    const wrapper = mount(CaptureModeIcon, { props: { mode } });
    expect(wrapper.attributes('role')).toBe('img');
    expect(wrapper.attributes('aria-label')).toBe(label);
    expect(wrapper.attributes('style')).toContain(`beam-${asset}.svg`);
    expect(wrapper.attributes('style')).toContain('width: 16px');
    const svg = readFileSync(`public/icons/capture/beam-${asset}.svg`, 'utf8');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).not.toMatch(/<script|<foreignObject|(?:href|src)="https?:/);
  });

  it('inherits color through a mask and permits the caller to set its size', () => {
    const wrapper = mount(CaptureModeIcon, {
      props: { mode: 'studio', size: 24 },
    });
    expect(wrapper.attributes('style')).toContain('width: 24px');
    expect(wrapper.attributes('style')).toContain('height: 24px');
    expect(wrapper.attributes('style')).toContain('mask-image:');
  });

  it('hides decorative icons from assistive technology', () => {
    const wrapper = mount(CaptureModeIcon, {
      props: { mode: 'instant', decorative: true },
    });
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    expect(wrapper.attributes('role')).toBeUndefined();
  });
});
