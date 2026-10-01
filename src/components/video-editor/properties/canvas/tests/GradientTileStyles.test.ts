import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

describe.each([
  ['canvas/canvas-panel.css', 'swatch-tile'],
  ['ColorFillPresetControls.vue', 'preset-tile'],
])('gradient tile painting in %s', (file, className) => {
  const filename = resolve(process.cwd(), 'src/components/video-editor/properties', file);
  const source = readFileSync(filename, 'utf8');
  const css = file.endsWith('.vue') ? parse(source).descriptor.styles[0]!.content : source;
  const result = compileStyle({ filename, source: css, id: 'data-v-gradient-test', scoped: true });

  it.each(['', 'active', 'editing'])(
    'paints one continuous gradient through rounded borders in state "%s"',
    (state) => {
      expect(result.errors).toEqual([]);
      const tile = document.createElement('button');
      tile.className = `${className} ${state}`;
      tile.setAttribute('data-v-gradient-test', '');
      const declarations = new Map<string, string>();
      result.rawResult!.root.walkRules((rule) => {
        if (rule.parent?.type === 'atrule' || !tile.matches(rule.selector)) return;
        rule.walkDecls((declaration) => {
          declarations.set(declaration.prop, declaration.value);
        });
      });
      expect(declarations.get('background-origin')).toBe('border-box');
      expect(declarations.get('background-clip')).toBe('border-box');
      expect(declarations.get('background-repeat')).toBe('no-repeat');
      expect(declarations.get('border-radius')).toBe('var(--radius-sm)');
    },
  );
});
