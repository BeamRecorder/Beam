import { readFileSync } from 'node:fs';
import { compileStyle } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
const css = readFileSync('apps/desktop/src/components/editor/properties/canvas/canvas-panel.css', 'utf8');
const result = compileStyle({ source: css, filename: 'canvas-panel.css', id: 'tiles', scoped: false });
const declarations = (selector: string) => {
  const values = new Map<string, string>();
  result.rawResult!.root.walkRules((rule) => {
    if (
      !rule.selector
        .split(',')
        .map((part) => part.trim())
        .includes(selector)
    )
      return;
    rule.walkDecls((declaration) => {
      values.set(declaration.prop, declaration.value);
    });
  });
  return values;
};
describe('catalogue tile selection', () => {
  it('shares border geometry, hover and active colors across media and swatches', () => {
    expect(result.errors).toEqual([]);
    for (const state of ['', ':hover:not(.active)', '.active', ':focus-visible']) {
      const media = declarations(`.media-tile${state}`);
      const swatch = declarations(`.swatch-tile${state}`);
      for (const field of ['border', 'border-color', 'border-radius', 'outline', 'outline-offset'])
        expect(swatch.get(field)).toBe(media.get(field));
    }
    expect(declarations('.media-tile').get('border')).toBe('1px solid var(--color-border)');
    expect(declarations('.media-tile.active').get('border-color')).toBe('var(--text-secondary)');
  });
  it('paints the identical inner selection ring above both images and gradients without changing their dimensions', () => {
    const media = declarations('.media-tile.active::after');
    expect(declarations('.swatch-tile.active::after')).toEqual(media);
    expect(media.get('position')).toBe('absolute');
    expect(media.get('inset')).toBe('0');
    expect(media.get('pointer-events')).toBe('none');
    expect(media.get('border')).toBe('1px solid var(--text-secondary)');
    expect(declarations('.swatch-tile.editing').has('outline')).toBe(false);
  });
});
