import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useCommandPalette } from './useCommandPalette';
import type { CommandPaletteItem } from './command-palette-types';
const fixture = () => {
  const items = ref<CommandPaletteItem[]>([
    {
      id: 'add',
      label: 'Add',
      children: [
        { id: 'text', label: 'Text', terms: ['caption'] },
        { id: 'nested', label: 'Media', children: [{ id: 'image', label: 'Image' }] },
      ],
    },
    { id: 'clips', label: 'Clips', children: [] },
    { id: 'disabled', label: 'Unavailable', disabled: true, children: [] },
    { id: 'exit', label: 'Exit', detail: 'Home' },
  ]);
  const scope = effectScope();
  const api = scope.run(() => useCommandPalette(items))!;
  return { items, api, stop: () => scope.stop() };
};
describe('command palette engine', () => {
  it('starts with categories and searches all descendants including aliases and parent names', () => {
    const f = fixture();
    expect(f.api.results.value.map((item) => item.id)).toEqual(['add', 'clips', 'disabled', 'exit']);
    f.api.query.value = 'caption';
    expect(f.api.results.value[0]?.id).toBe('text');
    f.api.query.value = 'image';
    expect(f.api.results.value[0]?.id).toBe('image');
    f.api.query.value = 'Home';
    expect(f.api.results.value[0]?.id).toBe('exit');
    f.api.query.value = 'nothing-matches';
    expect(f.api.results.value).toEqual([]);
    f.stop();
  });
  it('enters nested categories from global search, scopes results, backs up and resets', () => {
    const f = fixture();
    f.api.query.value = 'media';
    expect(f.api.enter(f.api.results.value[0]!)).toBe(true);
    expect(f.api.path.value).toEqual(['add', 'nested']);
    expect(f.api.query.value).toBe('');
    expect(f.api.branches.value.map((item) => item.label)).toEqual(['Add', 'Media']);
    expect(f.api.results.value.map((item) => item.id)).toEqual(['image']);
    f.api.back();
    expect(f.api.results.value.map((item) => item.id)).toEqual(['text', 'nested']);
    f.api.reset();
    expect(f.api.path.value).toEqual([]);
    f.stop();
  });
  it('wraps navigation and handles empty, disabled, missing and removed branches', async () => {
    const f = fixture();
    f.api.move(-1);
    expect(f.api.current.value).toBe(3);
    f.api.move(1);
    expect(f.api.current.value).toBe(0);
    expect(f.api.enter(f.items.value[2]!)).toBe(false);
    expect(f.api.enter(f.items.value[3]!)).toBe(false);
    expect(f.api.enter({ id: 'missing', label: 'Missing', children: [] })).toBe(true);
    expect(f.api.path.value).toEqual([]);
    f.api.enter(f.items.value[1]!);
    f.api.move(1);
    expect(f.api.current.value).toBe(0);
    f.items.value = [];
    await nextTick();
    expect(f.api.branches.value).toEqual([]);
    f.stop();
  });
  it('keeps mouse forward history only until a new branch or a reset', () => {
    const f = fixture();
    f.api.forward();
    expect(f.api.path.value).toEqual([]);
    f.api.enter(f.items.value[0]!);
    f.api.enter(f.api.results.value[1]!);
    f.api.back();
    f.api.back();
    f.api.forward();
    expect(f.api.path.value).toEqual(['add']);
    f.api.forward();
    expect(f.api.path.value).toEqual(['add', 'nested']);
    f.api.back();
    f.api.enter(f.items.value[1]!);
    f.api.forward();
    expect(f.api.path.value).toEqual(['clips']);
    f.api.back();
    f.api.reset();
    f.api.forward();
    expect(f.api.path.value).toEqual([]);
    f.stop();
  });
  it('preserves the active row while preview metadata loads but resets for a new search', async () => {
    const f = fixture();
    f.api.move(1);
    f.items.value[0]!.detail = 'Loaded';
    await nextTick();
    expect(f.api.current.value).toBe(1);
    f.api.query.value = 'Exit';
    await nextTick();
    expect(f.api.current.value).toBe(0);
    f.stop();
  });
});
