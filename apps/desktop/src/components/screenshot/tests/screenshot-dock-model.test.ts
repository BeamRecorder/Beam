import { expect, it } from 'vitest';
import { DEFAULT_DOCK_TOOLS, isDockTool, readDockTools, reorderDockTool } from '../screenshot-dock-model';

it('starts with Arrow before text and shapes and leaves grouping out of the default dock', () => {
  expect(readDockTools(undefined)).toEqual(DEFAULT_DOCK_TOOLS);
  expect(DEFAULT_DOCK_TOOLS.slice(0, 3)).toEqual(['arrow', 'text', 'shape']);
  expect(DEFAULT_DOCK_TOOLS).not.toContain('group');
  expect(DEFAULT_DOCK_TOOLS).not.toContain('ungroup');
});
it('inserts before, between and after tools without mutating or duplicating the original list', () => {
  const tools = ['arrow', 'text', 'shape', 'blur'] as const;
  expect(reorderDockTool(tools, 'shape', 0)).toEqual(['shape', 'arrow', 'text', 'blur']);
  expect(reorderDockTool(tools, 'arrow', 3)).toEqual(['text', 'shape', 'arrow', 'blur']);
  expect(reorderDockTool(tools, 'text', 4)).toEqual(['arrow', 'shape', 'blur', 'text']);
  expect(tools).toEqual(['arrow', 'text', 'shape', 'blur']);
});
it('does not save no-op drops, absent tools or invalid boundaries', () => {
  expect(reorderDockTool(['arrow', 'text'], 'arrow', 0)).toBeNull();
  expect(reorderDockTool(['arrow', 'text'], 'arrow', 1)).toBeNull();
  expect(reorderDockTool([], 'arrow', 0)).toBeNull();
  expect(reorderDockTool(['arrow'], 'blur', 0)).toBeNull();
  for (const value of [NaN, Infinity, -Infinity]) expect(reorderDockTool(['arrow'], 'arrow', value)).toBeNull();
});
it('bounds keyboard movement and normalizes fractional insertion slots', () => {
  expect(reorderDockTool(['arrow', 'text', 'blur'], 'blur', -5)).toEqual(['blur', 'arrow', 'text']);
  expect(reorderDockTool(['arrow', 'text', 'blur'], 'arrow', 99)).toEqual(['text', 'blur', 'arrow']);
  expect(reorderDockTool(['arrow', 'text', 'blur'], 'blur', 1.9)).toEqual(['arrow', 'blur', 'text']);
});
it('retains custom ordering and an intentionally empty dock', () => {
  expect(readDockTools(['blur', 'cursor', 'arrow'])).toEqual(['blur', 'cursor', 'arrow']);
  expect(readDockTools([])).toEqual([]);
  expect(isDockTool('cursor')).toBe(true);
  expect(isDockTool('unknown')).toBe(false);
});
it('bounds, deduplicates and sanitizes persisted IDs', () => {
  expect(readDockTools(['arrow', 'arrow', null, {}, 'video', 'shape'])).toEqual(['arrow', 'shape']);
  expect(readDockTools(new Array(10000).fill('arrow'))).toEqual(['arrow']);
  expect(readDockTools({})).toEqual(DEFAULT_DOCK_TOOLS);
});
