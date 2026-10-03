import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
const button = parse(readFileSync('apps/desktop/src/components/ui/button/Button.vue', 'utf8')).descriptor;
const styles = compileStyle({ source: button.styles[0]!.content, filename: 'Button.vue', id: 'button' });
const rules = new Map<string, Map<string, string>>();
styles.rawResult!.root.walkRules((rule) => {
  const declarations = new Map<string, string>();
  rule.walkDecls((decl) => {
    declarations.set(decl.prop, decl.value);
  });
  rules.set(rule.selector, declarations);
});
const theme = compileStyle({
  source: readFileSync('apps/desktop/src/theme/palette.css', 'utf8'),
  filename: 'palette.css',
  id: 'theme',
});
const palettes = new Map<string, Map<string, string>>();
theme.rawResult!.root.walkRules((rule) => {
  const values = new Map<string, string>();
  rule.walkDecls((decl) => {
    values.set(decl.prop, decl.value);
  });
  palettes.set(rule.selector, values);
});
const luminance = (hex: string) =>
  [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const value = Number.parseInt(hex.slice(index * 2 + 1, index * 2 + 3), 16) / 255;
    return sum + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  }, 0);

describe('shared destructive controls', () => {
  it('makes small icon-only buttons exactly as tall as labelled small buttons', () => {
    const height = rules.get('.btn-sm')!.get('height');
    expect(rules.get('.btn-icon-only.btn-sm')!.get('height')).toBe(height);
    expect(rules.get('.btn-icon-only.btn-sm')!.get('width')).toBe(height);
    expect(styles.errors).toEqual([]);
  });
  it('uses one theme red at rest and hover, with white text and icons in both themes', () => {
    expect(rules.get('.btn-danger')!.get('background-color')).toBe('var(--color-error)');
    expect(rules.get('.btn-danger:hover:not(:disabled)')!.get('background-color')).toBe('var(--color-error)');
    expect(rules.get('.btn-danger')!.get('color')).toBe('var(--text-on-error)');
    expect(readFileSync('apps/desktop/src/style.css', 'utf8')).toContain(
      '--color-error-light: color-mix(in srgb, var(--color-error) 10%, transparent)',
    );
    for (const selector of [':root', ':root.dark']) {
      const palette = palettes.get(selector)!;
      expect(palette.get('--text-on-error')).toBe('#ffffff');
      const contrast = 1.05 / (luminance(palette.get('--color-error')!) + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });
});
