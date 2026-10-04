import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileStyle } from '@vue/compiler-sfc';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ColorPickerCustom from '../ColorPickerCustom.vue';

enableAutoUnmount(afterEach);
const filename = resolve(process.cwd(), 'apps/desktop/src/components/ui/ColorPicker/ColorPickerCustom.css');
const scope = 'data-v-color-surface-test';
const compiled = compileStyle({
  filename,
  source: readFileSync(filename, 'utf8'),
  id: scope,
  scoped: true,
});
const declarations = new Map<string, string>();
const surface = document.createElement('div');
surface.className = 'sv-container';
surface.setAttribute(scope, '');
compiled.rawResult!.root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' || !surface.matches(rule.selector)) return;
  rule.walkDecls((declaration) => {
    declarations.set(declaration.prop, declaration.value);
  });
});

describe('color picker surface painting', () => {
  it('paints the hue, white saturation and black value on one rounded surface', () => {
    expect(compiled.errors).toEqual([]);
    expect(declarations.get('background-image')).toBe(
      'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
    );
    expect(declarations.get('background-origin')).toBe('border-box');
    expect(declarations.get('background-clip')).toBe('border-box');
    expect(declarations.get('background-repeat')).toBe('no-repeat');
    expect(declarations.get('border-radius')).toBe('var(--radius-sm)');
  });

  it('avoids a transparent border gap or separately composited rounded layers', () => {
    expect(declarations.get('border')).toBe('none');
    expect(declarations.has('transform')).toBe(false);
    expect(declarations.has('box-shadow')).toBe(false);
    expect(declarations.get('overflow')).toBe('hidden');
    expect(declarations.get('touch-action')).toBe('none');
    const wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#336699', type: 'standard' },
    });
    expect(wrapper.findAll('.sv-color-layer, .sv-white, .sv-black')).toHaveLength(0);
    expect(wrapper.get('.sv-container').element.children).toHaveLength(1);
    expect(wrapper.find('.sv-cursor').exists()).toBe(true);
  });

  it.each([
    ['#ff0000', 'rgb(255, 0, 0)'],
    ['#00ff00', 'rgb(0, 255, 0)'],
    ['#0000ff', 'rgb(0, 0, 255)'],
  ])('updates the rounded surface hue for %s', async (color, expectedHue) => {
    const wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#336699', type: 'standard' },
    });
    await wrapper.setProps({ modelValue: color });
    expect(wrapper.get<HTMLElement>('.sv-container').element.style.backgroundColor).toBe(expectedHue);
    expect(wrapper.get('.sv-cursor').attributes('style')).toContain('left: 100%');
    expect(wrapper.get('.sv-cursor').attributes('style')).toContain('top: 0%');
  });
});
