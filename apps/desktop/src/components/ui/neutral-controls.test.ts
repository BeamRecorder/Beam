import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const buttonPath = resolve(process.cwd(), 'apps/desktop/src/components/ui/button/Button.vue');
const buttonSource = parse(readFileSync(buttonPath, 'utf8')).descriptor.styles[0]!.content;
const selectSource = readFileSync(resolve(process.cwd(), 'apps/desktop/src/components/ui/select/Select.css'), 'utf8');
const scope = 'data-v-neutral-controls';

const declarationsFor = (source: string, classes: string, pseudo = '') => {
  const compiled = compileStyle({
    source,
    filename: 'controls.css',
    id: scope,
    scoped: true,
  });
  expect(compiled.errors).toEqual([]);
  const element = document.createElement('button');
  element.className = `${classes} ${pseudo}`;
  element.setAttribute(scope, '');
  const declarations = new Map<string, string>();
  compiled.rawResult!.root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule') return;
    const selector = rule.selector.replace(/:hover/g, '.hover').replace(/:focus-visible/g, '.focus-visible');
    if (!element.matches(selector)) return;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });
  return declarations;
};

describe('neutral control appearance', () => {
  it('keeps recenter-style frosted controls neutral with a small shadow on hover', () => {
    const hovered = declarationsFor(buttonSource, 'btn btn-frosted', 'hover');
    expect(hovered.get('color')).toBe('var(--text-primary)');
    expect(hovered.get('border-color')).toBe('var(--color-border-strong)');
    expect(hovered.get('box-shadow')).toBe('var(--shadow-sm)');
    expect([...hovered.values()].join(' ')).not.toContain('--color-primary');
    expect(declarationsFor(buttonSource, 'btn btn-frosted').get('box-shadow')).toBe('var(--shadow-sm)');
  });

  it.each(['btn-secondary', 'btn-ghost', 'btn-outline', 'btn-card'])('keeps %s hover feedback neutral', (variant) => {
    expect([...declarationsFor(buttonSource, `btn ${variant}`, 'hover').values()].join(' ')).not.toContain(
      '--color-primary',
    );
  });

  it('preserves the accent for primary actions and selected cards', () => {
    expect(declarationsFor(buttonSource, 'btn btn-primary', 'hover').get('background-color')).toBe(
      'var(--color-primary-hover)',
    );
    expect(declarationsFor(buttonSource, 'btn btn-card is-selected', 'hover').get('border-color')).toBe(
      'var(--color-primary)',
    );
  });

  it.each(['select-trigger', 'select-trigger is-open', 'select-trigger select-compact is-open'])(
    'keeps %s neutral on hover and open',
    (classes) => {
      const declarations = declarationsFor(selectSource, classes, 'hover');
      expect([...declarations.values()].join(' ')).not.toContain('--color-primary');
      expect(declarations.get('border-color')).toBe('var(--color-border-strong)');
    },
  );

  it.each(['hover', 'is-hovered', 'focus-visible'])('keeps option %s distinct from selection', (state) => {
    const option = declarationsFor(selectSource, `select-option ${state}`, state);
    expect(option.get('background-color')).toBe('var(--color-bg-surface-hover)');
    expect(option.get('color')).toBe('var(--text-primary)');
    expect([...option.values()].join(' ')).not.toContain('--color-primary');
  });

  it('uses a neutral selected row with an accented check and a muted preview eye', () => {
    const selected = declarationsFor(selectSource, 'select-option is-selected', 'hover');
    expect(selected.get('background-color')).toBe('var(--color-bg-field-active)');
    expect(selected.get('color')).toBe('var(--text-primary)');
    expect(declarationsFor(selectSource, 'option-check').get('color')).toBe('var(--color-primary)');
    expect(declarationsFor(selectSource, 'option-check option-eye').get('color')).toBe('var(--text-secondary)');
  });

  it.each(['select-trigger', 'select-option'])('keeps a visible neutral keyboard focus for %s', (classes) => {
    const focused = declarationsFor(selectSource, classes, 'focus-visible');
    expect(focused.get('outline')).toBe('2px solid var(--text-secondary)');
    expect(focused.get('outline-offset')).toBe(classes === 'select-option' ? '-2px' : '2px');
  });
});
