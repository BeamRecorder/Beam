import { describe, expect, it, vi } from 'vitest';
import { canvasDoubleClick } from './canvas-double-click';
import type { CanvasDoubleClickOptions } from './canvas-edit-types';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
const setup = (overrides: Partial<CanvasDoubleClickOptions> = {}) => ({
  beginElement: vi.fn(() => false),
  beginCaption: vi.fn(() => false),
  blocked: () => false,
  clipIdAt: vi.fn(() => null),
  composition: () => emptyComposition(),
  crop: vi.fn(),
  add: vi.fn(),
  ...overrides,
});
const event = () => new MouseEvent('dblclick', { button: 0 });
describe('canvas double click', () => {
  it('opens Add at the pointer only in empty space', () => {
    const options = setup();
    const pointer = event();
    canvasDoubleClick(pointer, options);
    expect(options.add).toHaveBeenCalledWith(pointer);
    expect(options.crop).not.toHaveBeenCalled();
  });
  it.each(['beginElement', 'beginCaption'] as const)('retains %s editing', (key) => {
    const options = setup({ [key]: vi.fn(() => true) });
    canvasDoubleClick(event(), options);
    expect(options.add).not.toHaveBeenCalled();
    expect(options.clipIdAt).not.toHaveBeenCalled();
  });
  it.each([true, false])('retains crop editing and respects lock %s', (locked) => {
    const clip = {
      id: 'clip',
      kind: 'video' as const,
      name: 'clip',
      trackId: 'video',
      assetId: 'asset',
      sourceInMs: 0,
      sourceOutMs: 1000,
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      playbackRate: 1,
      enabled: true,
      locked,
      isMirrored: false,
      isMirroredY: false,
      sourceDurationMs: 1000,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('video'),
    };
    const options = setup({ clipIdAt: () => clip.id, composition: () => ({ ...emptyComposition(), clips: [clip] }) });
    canvasDoubleClick(event(), options);
    expect(options.add).not.toHaveBeenCalled();
    expect(options.crop).toHaveBeenCalledTimes(locked ? 0 : 1);
  });
  it('does not open Add on unresolved clip hits', () => {
    const options = setup({ clipIdAt: () => 'missing' });
    canvasDoubleClick(event(), options);
    expect(options.add).not.toHaveBeenCalled();
  });
  it.each([{ button: 2 }, { ctrlKey: true }, { metaKey: true }])('ignores modified or secondary clicks %o', (init) => {
    const options = setup();
    canvasDoubleClick(new MouseEvent('dblclick', init), options);
    expect(options.add).not.toHaveBeenCalled();
  });
  it('ignores playback/crop/manual zoom and interactive controls', () => {
    const options = setup({ blocked: () => true });
    canvasDoubleClick(event(), options);
    expect(options.beginElement).not.toHaveBeenCalled();
    const active = setup();
    const button = document.createElement('button');
    const pointer = event();
    Object.defineProperty(pointer, 'target', { value: button });
    canvasDoubleClick(pointer, active);
    expect(active.add).not.toHaveBeenCalled();
  });
});
