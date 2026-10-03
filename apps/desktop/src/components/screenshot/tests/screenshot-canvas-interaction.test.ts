import { it, expect, vi } from 'vitest';
import { createStillDocument } from '@beam/engine';
import { screenshotCanvasInteraction } from '../screenshot-canvas-interaction';
const fixture = () => {
  const state = createStillDocument('test', 'source.png', 100, 100).state;
  state.image.transform = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 100));
  const options = { state: () => state, assets: () => null, canvas: () => canvas as HTMLCanvasElement | null,
    blocked: vi.fn(() => false), select: vi.fn(), beginText: vi.fn(() => false), crop: vi.fn(), add: vi.fn() };
  return { options, state, interaction: screenshotCanvasInteraction(options) };
};
const click = (options: MouseEventInit = {}) => new MouseEvent('dblclick', { button: 0, clientX: 45, clientY: 55, ...options });
it('clears selection on the background and outside the canvas while preserving additive clicks', () => {
  const f = fixture();
  f.interaction.select(click({ clientX: 95, clientY: 105 }) as PointerEvent);
  f.interaction.select(click({ clientX: -100 }) as PointerEvent);
  expect(f.options.select.mock.calls).toEqual([[null], [null]]);
  f.interaction.select(click({ ctrlKey: true }) as PointerEvent);
  f.interaction.select(click({ metaKey: true }) as PointerEvent);
  f.interaction.select(click({ shiftKey: true }) as PointerEvent);
  expect(f.options.select.mock.calls.slice(2)).toEqual([['image', 'toggle'], ['image', 'toggle'], ['image', 'toggle']]);
});
it('opens Add in empty space and keeps image crop and text editing on their own hits', () => {
  const f = fixture();
  const empty = click({ clientX: 95, clientY: 105 });
  f.interaction.editLayer(empty);
  expect(f.options.add).toHaveBeenCalledWith(empty);
  f.interaction.editLayer(click());
  expect(f.options.crop).toHaveBeenCalledWith('image');
  f.options.beginText.mockReturnValue(true);
  f.interaction.editLayer(click());
  expect(f.options.crop).toHaveBeenCalledOnce();
});
it('ignores disabled, pan-consumed, non-left and modified double-click events', () => {
  const f = fixture();
  f.options.blocked.mockReturnValue(true);
  f.interaction.select(click() as PointerEvent); f.interaction.editLayer(click());
  f.options.blocked.mockReturnValue(false);
  const prevented = new MouseEvent('pointerdown', { cancelable: true }); prevented.preventDefault();
  f.interaction.select(prevented as PointerEvent);
  for (const init of [{ button: 2 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) f.interaction.editLayer(click(init));
  f.interaction.select(click({ button: 1 }) as PointerEvent);
  expect(f.options.select).not.toHaveBeenCalled(); expect(f.options.add).not.toHaveBeenCalled(); expect(f.options.crop).not.toHaveBeenCalled();
});
it('does not open Add from interactive controls or crop non-image elements', () => {
  const f = fixture();
  const event = click({ clientX: 95 });
  Object.defineProperty(event, 'target', { value: document.createElement('button') });
  f.interaction.editLayer(event);
  expect(f.options.add).not.toHaveBeenCalled();
  f.state.image.enabled = false;
  f.state.shapes = [{ id: 'text', enabled: true, kind: 'shape', transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } } as typeof f.state.shapes[number]];
  f.interaction.editLayer(click());
  expect(f.options.crop).not.toHaveBeenCalled();
});
it('handles an unloaded or zero-size canvas without invalid hit coordinates', () => {
  const f = fixture();
  f.options.canvas = () => null;
  expect(f.interaction.layerAt(click())).toBeNull();
  const canvas = document.createElement('canvas'); f.options.canvas = () => canvas;
  expect(f.interaction.layerAt(click())).toBeNull();
});
