import { describe, expect, it } from 'vitest';
import { createFuzzySearchEngine } from './fuzzy-search';
import type { SelectOption } from './select-types';

const option = (value: string, label: string, keywords?: readonly string[]): SelectOption => ({
  value,
  label,
  ...(keywords ? { keywords } : {}),
});

describe('createFuzzySearchEngine', () => {
  it('returns a fresh copy in the original order for an empty query', () => {
    const items = [option('third', 'Third'), option('first', 'First'), option('second', 'Second')];
    const engine = createFuzzySearchEngine(items, (item) => [item.label]);

    const result = engine.search('   ');

    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it('ranks exact matches ahead of prefixes and keeps prefix order deterministic', () => {
    const items = [
      option('serif', 'Noto Serif'),
      option('exact', 'Noto'),
      option('sans', 'Noto Sans'),
      option('other', 'Roboto'),
    ];
    const engine = createFuzzySearchEngine(items, (item) => [item.label]);

    expect(engine.search('noto').map((item) => item.value)).toEqual(['exact', 'sans', 'serif']);
  });

  it('matches a non-contiguous subsequence when no contiguous match exists', () => {
    const items = [option('target', 'Noto Sans'), option('unrelated', 'Roboto')];
    const engine = createFuzzySearchEngine(items, (item) => [item.label]);

    expect(engine.search('nts').map((item) => item.value)).toEqual(['target']);
  });

  it('requires every token while allowing tokens to match in any order', () => {
    const items = [
      option('noto-sans', 'Noto Sans'),
      option('noto', 'Noto'),
      option('sans', 'Sans Serif'),
      option('mono', 'Mono'),
    ];
    const engine = createFuzzySearchEngine(items, (item) => [item.label]);

    expect(engine.search('sans noto').map((item) => item.value)).toEqual(['noto-sans']);
  });

  it('normalizes accents, case, and punctuation before matching', () => {
    const items = [option('cafe', 'Café—Mono'), option('other', 'Other Font')];
    const engine = createFuzzySearchEngine(items, (item) => [item.label]);

    expect(engine.search('CAFE MONO').map((item) => item.value)).toEqual(['cafe']);
  });

  it('matches searchable keywords in addition to the visible label', () => {
    const items = [
      option('arrow', 'Default cursor', ['pointer', 'mouse arrow']),
      option('hand', 'Hand cursor', ['click target']),
    ];
    const engine = createFuzzySearchEngine(items, (item) => [item.label, ...(item.keywords ?? [])]);

    expect(engine.search('mouse arrow').map((item) => item.value)).toEqual(['arrow']);
    expect(engine.search('click').map((item) => item.value)).toEqual(['hand']);
  });

  it('returns no results when any query token is absent', () => {
    const items = [option('sans', 'Noto Sans'), option('serif', 'Noto Serif')];
    const engine = createFuzzySearchEngine(items, (item) => [item.label]);

    expect(engine.search('noto display')).toEqual([]);
  });

  it('does not mutate the indexed input or its option objects across searches', () => {
    const items = [option('b', 'Beta'), option('a', 'Alpha')];
    const originalItems = items.slice();
    const originalLabels = items.map((item) => item.label);
    const engine = createFuzzySearchEngine(items, (item) => [item.label]);

    engine.search('alpha');
    engine.search('');

    expect(items).toEqual(originalItems);
    expect(items.map((item) => item.label)).toEqual(originalLabels);
    expect(items[0]).toBe(originalItems[0]);
    expect(items[1]).toBe(originalItems[1]);
  });
});
