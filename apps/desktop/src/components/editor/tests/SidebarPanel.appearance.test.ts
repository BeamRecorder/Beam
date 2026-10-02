import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const source = parse(
  readFileSync(resolve(process.cwd(), 'apps/desktop/src/components/editor/sidebar/SidebarPanel.vue'), 'utf8'),
).descriptor.styles[0]!.content;
const scope = 'data-v-sidebar-appearance';
const compiled = compileStyle({
  source,
  filename: 'SidebarPanel.vue',
  id: scope,
  scoped: true,
});
const themeSource = ['palette.css', 'surfaces.css']
  .map((name) => readFileSync(resolve(process.cwd(), 'apps/desktop/src/theme', name), 'utf8'))
  .join('\n');

const declarationsFor = (active: boolean, dark = false, pseudo = '', label = false, indicator = false) => {
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  root.classList.toggle('dark', dark);
  const button = document.createElement('button');
  button.className = `nav-btn ${active ? 'active' : ''} ${pseudo}`;
  button.setAttribute(scope, '');
  const text = document.createElement('span');
  text.className = 'nav-label';
  text.setAttribute(scope, '');
  button.append(text);
  const selection = document.createElement('span');
  selection.className = 'sidebar-selection';
  selection.setAttribute(scope, '');
  button.append(selection);
  document.body.append(button);
  const values = new Map<string, string>();
  try {
    compiled.rawResult!.root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule') return;
      const selector = rule.selector.replace(/:hover/g, '.hover').replace(/:focus-visible/g, '.focus-visible');
      if (!(indicator ? selection : label ? text : button).matches(selector)) return;
      rule.walkDecls((declaration) => {
        values.set(declaration.prop, declaration.value);
      });
    });
    return values;
  } finally {
    button.remove();
    root.classList.toggle('dark', wasDark);
  }
};

const paletteFor = (dark: boolean) => {
  const values = new Map<string, string>();
  const palette = compileStyle({
    source: themeSource,
    filename: 'theme.css',
    id: 'palette',
  });
  palette.rawResult!.root.walkRules((rule) => {
    if (rule.selector !== ':root' && !(dark && rule.selector === ':root.dark')) return;
    rule.walkDecls((declaration) => {
      values.set(declaration.prop, declaration.value);
    });
  });
  return values;
};

const luminance = (hex: string) => {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
};
const contrast = (a: string, b: string) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
};

describe('sidebar selection appearance', () => {
  it('keeps the active surface scoped to its component', () => {
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain(`.nav-btn.active[${scope}]`);
  });

  it.each([false, true])('distinguishes selection from hover without a border (dark: %s)', (dark) => {
    const active = declarationsFor(true, dark, 'hover');
    const hover = declarationsFor(false, dark, 'hover');
    expect(active.get('border')).toBe('none');
    expect(active.has('border-color')).toBe(false);
    expect(active.has('outline')).toBe(false);
    expect(active.has('box-shadow')).toBe(false);
    expect(active.get('background')).not.toBe(hover.get('background'));
    expect(active.get('background')).toBe('transparent');
    expect(declarationsFor(true, dark, '', false, true).get('background')).toBe('var(--color-primary)');
    expect(active.get('color')).toBe('var(--text-on-primary)');
    expect(declarationsFor(true, dark, '', true).get('font-weight')).toBe('var(--weight-display)');
  });

  it.each([false, true])('keeps selected text legible and the surface distinct from hover (dark: %s)', (dark) => {
    const palette = paletteFor(dark);
    const token = declarationsFor(true, dark, '', false, true)
      .get('background')!
      .match(/var\(([^)]+)\)/)![1]!;
    const background = palette.get(token)!;
    expect(contrast(palette.get('--text-on-primary')!, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(background, palette.get('--color-bg-app')!)).toBeGreaterThan(
      contrast(palette.get('--color-bg-surface-hover')!, palette.get('--color-bg-app')!),
    );
  });

  it('increases the selected background contrast on the light sidebar', () => {
    const palette = paletteFor(false);
    const rail = palette.get('--color-bg-app')!;
    expect(contrast(palette.get('--color-primary')!, rail)).toBeGreaterThan(
      contrast(palette.get('--color-bg-field-active')!, rail),
    );
  });

  it('shows an outline only for keyboard focus', () => {
    expect(declarationsFor(true).has('outline')).toBe(false);
    expect(declarationsFor(true, false, 'focus-visible').get('outline')).toBe('2px solid var(--text-secondary)');
    expect(declarationsFor(false, true, 'focus-visible').get('outline')).toBe('2px solid var(--text-secondary)');
  });
});
