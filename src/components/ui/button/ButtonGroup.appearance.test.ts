import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import type { ButtonGroupVariant } from './button-group-types';

const directory = resolve(process.cwd(), 'src/components/ui/button');
const scope = 'data-v-button-group-appearance';
const sources = [
  parse(readFileSync(resolve(directory, 'ButtonGroup.vue'), 'utf8')).descriptor.styles[0]!.content,
  parse(readFileSync(resolve(directory, 'Button.vue'), 'utf8')).descriptor.styles[0]!.content,
  readFileSync(resolve(directory, 'button-group-item.css'), 'utf8'),
];
const styles = sources.map((source) => compileStyle({ source, filename: 'buttons.css', id: scope, scoped: true }));
const theme = compileStyle({
  source: ['palette.css', 'surfaces.css']
    .map((name) => readFileSync(resolve(process.cwd(), 'src/theme', name), 'utf8'))
    .join('\n'),
  filename: 'theme.css',
  id: 'palette',
});

const paletteFor = (dark: boolean) => {
  const values = new Map<string, string>();
  theme.rawResult!.root.walkRules((rule) => {
    if (rule.selector !== ':root' && !(dark && rule.selector === ':root.dark')) return;
    rule.walkDecls((declaration) => {
      values.set(declaration.prop, declaration.value);
    });
  });
  return values;
};

const declarationsFor = (
  classes: string,
  dark = false,
  indicator = false,
  pseudo = '',
  variant: ButtonGroupVariant = 'neutral',
) => {
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  root.classList.toggle('dark', dark);
  const group = document.createElement('div');
  group.className = `btn-group variant-${variant} ${indicator ? 'has-indicator' : ''}`;
  group.setAttribute(scope, '');
  const element = document.createElement('button');
  element.className = `${classes} ${pseudo}`;
  element.setAttribute(scope, '');
  group.append(element);
  document.body.append(group);
  const values = new Map<string, string>();
  try {
    for (const style of styles) {
      style.rawResult!.root.walkRules((rule) => {
        if (rule.parent?.type === 'atrule') return;
        const selector = rule.selector.replace(/:hover/g, '.hover').replace(/:focus-visible/g, '.focus-visible');
        const matchesElement = element.matches(selector);
        const matchesGroup = group.matches(selector);
        if (!matchesElement && !matchesGroup) return;
        rule.walkDecls((declaration) => {
          if (!matchesElement && !declaration.prop.startsWith('--')) return;
          values.set(declaration.prop === 'background-color' ? 'background' : declaration.prop, declaration.value);
        });
      });
    }
    return values;
  } finally {
    group.remove();
    root.classList.toggle('dark', wasDark);
  }
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

describe('button group selection appearance', () => {
  it('compiles component and shared item styles with scoped dark-theme rules', () => {
    expect(styles.flatMap((style) => style.errors)).toEqual([]);
    expect(styles[0]!.code).toContain(`:root.dark .btn-group.variant-neutral[${scope}]`);
    expect(styles[2]!.code).toContain('var(--button-group-selection-background)');
  });

  it('increases the moving selection contrast against the light group surface', () => {
    const palette = paletteFor(false);
    const background = declarationsFor('selection-indicator').get('--button-group-selection-background')!;
    const token = background.match(/var\(([^)]+)\)/)![1]!;
    const selected = palette.get(token)!;
    expect(selected).toBe('#ffffff');
    expect(contrast(selected, palette.get('--color-bg-well')!)).toBeGreaterThan(
      contrast(palette.get('--color-bg-field-hover')!, palette.get('--color-bg-well')!),
    );
    expect(contrast(palette.get('--text-primary')!, selected)).toBeGreaterThanOrEqual(7);
  });

  it('uses the dark neutral active surface for a neutral moving selection', () => {
    expect(declarationsFor('selection-indicator', true).get('--button-group-selection-background')).toBe(
      'var(--color-bg-field-active)',
    );
  });

  it.each(['btn-selected', 'btn-tab active'])(
    'keeps compact %s selected states white, bold and borderless during hover',
    (variant) => {
      for (const pseudo of ['', 'hover']) {
        const selected = declarationsFor(`btn btn-xs ${variant}`, false, false, pseudo);
        expect(selected.get('background')).toBe('var(--button-group-selection-background)');
        expect(selected.get('--button-group-selection-background')).toBe('var(--color-bg-element)');
        expect(selected.get('border-color')).toBe('transparent');
        expect(selected.get('box-shadow')).toBe('none');
        expect(selected.get('font-weight')).toBe('var(--weight-display)');
        expect(selected.get('color')).toBe('var(--button-group-selection-foreground)');
        expect(selected.get('--button-group-selection-foreground')).toBe('var(--text-primary)');
      }
    },
  );

  it.each(['btn-ghost', 'btn-tab'])('keeps unselected %s hover distinct from selection and neutral', (variant) => {
    const hovered = declarationsFor(`btn btn-xs ${variant}`, false, false, 'hover');
    expect(hovered.get('background')).not.toBe('var(--color-bg-element)');
    expect([hovered.get('background'), hovered.get('color')].join(' ')).not.toContain('--color-primary');
    const primaryHover = declarationsFor(`btn btn-xs ${variant}`, false, false, 'hover', 'primary');
    expect(primaryHover.get('background')).toBe(hovered.get('background'));
    expect(primaryHover.get('color')).toBe(hovered.get('color'));
    expect(hovered.get('font-weight')).not.toBe('var(--weight-display)');
  });

  it.each([false, true])('lets the moving indicator own the selected background (dark: %s)', (dark) => {
    for (const variant of ['primary', 'neutral'] as const) {
      const selected = declarationsFor('btn btn-xs btn-tab active', dark, true, 'hover', variant);
      expect(selected.get('background')).toBe('transparent');
      expect(selected.get('box-shadow')).toBe('none');
      expect(selected.get('border-color')).toBe('transparent');
      expect(selected.get('font-weight')).toBe('var(--weight-display)');
      expect(selected.get('color')).toBe('var(--button-group-selection-foreground)');
    }
  });

  it('retains dark grouped selection contrast during hover', () => {
    expect(declarationsFor('btn btn-selected', true, false, 'hover').get('--button-group-selection-background')).toBe(
      'var(--color-bg-field-active)',
    );
  });

  it.each([false, true])(
    'uses Beam orange and its matching ink for primary choices and indicators (dark: %s)',
    (dark) => {
      for (const classes of ['selection-indicator', 'btn btn-xs btn-selected', 'btn btn-xs btn-tab active']) {
        const selected = declarationsFor(classes, dark, false, 'hover', 'primary');
        expect(selected.get('--button-group-selection-background')).toBe('var(--color-primary)');
        expect(selected.get('--button-group-selection-foreground')).toBe('var(--text-on-primary)');
        expect(selected.get('background')).toBe('var(--button-group-selection-background)');
      }
      const palette = paletteFor(dark);
      expect(contrast(palette.get('--text-on-primary')!, palette.get('--color-primary')!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('preserves a neutral keyboard focus outline without adding a permanent outline', () => {
    expect(declarationsFor('btn btn-selected').has('outline')).toBe(false);
    expect(declarationsFor('btn btn-selected', false, false, 'focus-visible').get('outline')).toBe(
      '2px solid var(--text-secondary)',
    );
  });
});
