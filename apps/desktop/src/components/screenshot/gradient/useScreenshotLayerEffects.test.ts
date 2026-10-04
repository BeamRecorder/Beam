import { describe, it, expect, vi } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import { createStillDocument } from '@beam/engine';
import { useScreenshotLayerEffects } from './useScreenshotLayerEffects';
const setup = () => {
  const state = ref(createStillDocument('test', 'source.png', 100, 100).state),
    selectedId = ref<string | null>('image');
  const disabled = ref(false);
  const scope = effectScope();
  const select = vi.fn((id: string) => {
    selectedId.value = id;
  });
  const effects = scope.run(() =>
    useScreenshotLayerEffects({ state, selectedId, select, disabled: () => disabled.value, inspect: vi.fn() }),
  )!;
  return { state, selectedId, disabled, scope, effects, select };
};
describe('Screenshot attached effect editing', () => {
  it.each(['color-adjustment', 'grayscale'] as const)(
    'adds %s and preserves its discriminator through updates',
    (kind) => {
      const f = setup();
      f.effects.add('image');
      f.effects.add('image', kind);
      const selected = f.effects.selected.value!;
      if (selected.kind !== 'color-adjustment') throw new Error('Expected color effect');
      expect(selected.recipe.grayscale).toBe(kind === 'grayscale' ? 100 : 0);
      f.effects.update({ recipe: { ...selected.recipe, hue: 45 } });
      expect(f.effects.selected.value?.kind).toBe('color-adjustment');
      expect(f.effects.selected.value?.recipe).toMatchObject({ hue: 45 });
      expect(() => f.effects.update({ recipe: { ...selected.recipe, saturation: 201 } })).toThrow();
      expect(f.effects.selected.value?.recipe).toMatchObject({ saturation: 100 });
      f.scope.stop();
    },
  );
  it('adds and selects a gradient on its owning layer without adding another composition layer', () => {
    const f = setup(),
      count = f.state.value.composition!.length;
    f.effects.add('image');
    expect(f.effects.selected.value?.kind).toBe('gradient');
    expect(f.state.value.composition!.length).toBe(count);
    expect(f.select).toHaveBeenCalledWith('image');
    f.scope.stop();
  });
  it('updates the selected effect independently and selects a newly added effect after Vue flushes', async () => {
    const f = setup();
    f.effects.add('image');
    const first = f.effects.selected.value!.id;
    f.effects.add('image');
    const second = f.effects.selected.value!.id;
    await nextTick();
    expect(f.effects.selected.value!.id).toBe(second);
    f.effects.update({ opacity: 35 });
    expect(f.state.value.composition!.find((l) => l.id === 'image')!.effects!.map((e) => e.opacity)).toEqual([100, 35]);
    f.effects.toggle('image', first);
    expect(f.effects.selected.value!.enabled).toBe(false);
    f.effects.remove();
    expect(f.effects.selected.value!.id).toBe(second);
    f.scope.stop();
  });
  it('does not mutate locked, disabled, missing or full targets', () => {
    const f = setup();
    f.disabled.value = true;
    f.effects.add('image');
    expect(f.effects.selected.value).toBeUndefined();
    f.disabled.value = false;
    f.state.value.composition!.find((l) => l.id === 'image')!.locked = true;
    f.effects.add('image');
    expect(f.effects.selected.value).toBeUndefined();
    f.state.value.composition!.find((l) => l.id === 'image')!.locked = false;
    f.effects.add('missing');
    expect(f.effects.selected.value).toBeUndefined();
    for (let i = 0; i < 5; i++) f.effects.add('image');
    expect(f.state.value.composition!.find((l) => l.id === 'image')!.effects).toHaveLength(4);
    f.disabled.value = true;
    f.effects.update({ opacity: 40 });
    f.effects.remove();
    expect(f.state.value.composition!.find((l) => l.id === 'image')!.effects).toHaveLength(4);
    f.scope.stop();
  });
  it('selects another owning layer and rejects invalid updates atomically', () => {
    const f = setup();
    f.effects.add('image');
    expect(() => f.effects.update({ opacity: -1 })).toThrow();
    expect(f.effects.selected.value!.opacity).toBe(100);
    f.effects.add('__background__');
    expect(f.selectedId.value).toBe('__background__');
    expect(f.effects.selected.value).toBeDefined();
    f.scope.stop();
  });
  it('ignores updates without selection and reconciles deleted effects', () => {
    const f = setup();
    f.effects.update({ opacity: 50 });
    f.effects.remove();
    f.effects.add('image');
    f.select.mockClear();
    f.effects.remove();
    expect(f.effects.selected.value).toBeUndefined();
    expect(f.select).toHaveBeenCalledWith('image');
    f.selectedId.value = null;
    expect(f.effects.selected.value).toBeUndefined();
    f.scope.stop();
  });
  it('ignores stale effect selection and toggles instead of modifying the first effect', () => {
    const f = setup();
    f.effects.add('image');
    f.effects.toggle('image', 'missing');
    f.effects.toggle('missing', 'missing');
    expect(f.effects.selected.value!.enabled).toBe(true);
    f.disabled.value = true;
    f.effects.toggle('image', f.effects.selected.value!.id);
    expect(f.effects.selected.value!.enabled).toBe(true);
    f.scope.stop();
  });
});
