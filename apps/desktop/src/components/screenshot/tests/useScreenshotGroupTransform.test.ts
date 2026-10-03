import { afterEach, describe, it, expect } from 'vitest';
import { effectScope, shallowRef, ref } from 'vue';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { createStillCommands } from '@beam/engine/screenshot/still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';
import { insertScreenshotLayer } from '@beam/engine/screenshot/screenshot-layers';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  resetPropertyInteractions,
} from '~/composables/property-interaction';
import { useScreenshotGroupTransform } from '../useScreenshotGroupTransform';
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  resetPropertyInteractions();
});
function fixture() {
  let doc = createStillDocument('project', 'image.png', 1920, 1080);
  const registry = createStillCommands();
  for (const [index, id] of ['a', 'b', 'outside'].entries())
    doc = registry.execute(doc, {
      type: 'still.layer.add',
      payload: {
        ...doc.state.image,
        ...DEFAULT_SHAPE_LAYER_STYLE,
        id,
        kind: 'shape',
        assetId: '',
        family: 'text',
        preset: 'text',
        text: createElementText(id),
        transform: { x: 0.1 + index * 0.2, y: 0.2, width: 0.1, height: 0.1 },
      },
    });
  const state = shallowRef<ScreenshotState | null>(doc.state),
    selected = ref(['a', 'b']);
  const bounds = shallowRef<NormalizedTransform | null>({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }),
    disabled = ref(false);
  const scope = effectScope();
  scopes.push(scope);
  return {
    state,
    selected,
    bounds,
    disabled,
    ...scope.run(() =>
      useScreenshotGroupTransform(
        state,
        selected,
        () => bounds.value,
        () => disabled.value,
      ),
    )!,
  };
}
describe('group Placement inspector', () => {
  it('moves and proportionally resizes all members and native text while preserving unrelated layers', () => {
    const g = fixture(),
      original = g.state.value!,
      fontSize = original.shapes[0]!.text!.style.fontSize;
    expect(g.editable.value).toBe(true);
    g.transform({ x: 0.2, y: 0.4, width: 0.6, height: 0.2 });
    expect(g.state.value!.shapes[0]!.transform).toEqual({ x: 0.2, y: 0.4, width: 0.2, height: 0.2 });
    expect(g.state.value!.shapes[1]!.transform.x).toBeCloseTo(0.6);
    expect(g.state.value!.shapes[0]!.text!.style.fontSize).toBe(fontSize * 2);
    expect(g.state.value!.shapes[2]).toBe(original.shapes[2]);
  });
  it('rotates around the shared center and keeps a stable pivot through continuous angle drags', () => {
    const g = fixture(),
      original = g.state.value!;
    beginPropertyInteraction();
    g.rotate(45);
    g.bounds.value = { x: 0.1, y: 0.1, width: 0.2, height: 0.5 };
    g.rotate(90);
    expect(g.rotation.value).toBe(90);
    expect(g.state.value!.shapes[0]!.transform.x).toBeCloseTo(0.2);
    expect(g.state.value!.shapes[0]!.transform.y).toBeCloseTo(0.2 - 192 / 1080);
    expect(g.state.value!.shapes[2]).toBe(original.shapes[2]);
    endPropertyInteraction();
    g.rotate(180);
    expect(g.rotation.value).toBe(180);
    expect(g.state.value!.shapes[1]!.rotation).toBe(180);
  });
  it('retains the initial typography through resizing above its limit and back within one gesture', () => {
    const g = fixture(),
      original = g.state.value!,
      fontSize = original.shapes[0]!.text!.style.fontSize;
    beginPropertyInteraction();
    g.transform({ x: 0.1, y: 0.2, width: 6, height: 2 });
    g.bounds.value = { x: 0.1, y: 0.2, width: 6, height: 2 };
    g.transform({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 });
    expect(g.state.value!.shapes[0]!.text!.style.fontSize).toBe(fontSize);
    endPropertyInteraction();
  });
  it('ignores disabled controls, unloaded bounds, missing state and nonfinite angles', () => {
    const g = fixture(),
      original = g.state.value!;
    g.disabled.value = true;
    g.transform(g.bounds.value!);
    g.rotate(90);
    expect(g.state.value).toBe(original);
    g.disabled.value = false;
    g.bounds.value = null;
    g.transform({ x: 0, y: 0, width: 1, height: 1 });
    g.rotate(90);
    g.bounds.value = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 };
    g.rotate(NaN);
    expect(g.state.value).toBe(original);
    g.state.value = null;
    expect(g.rotation.value).toBe(0);
    expect(g.editable.value).toBe(false);
    g.transform(g.bounds.value!);
    g.rotate(90);
  });
  it('blocks singleton, unknown, reserved and locked selections', () => {
    const g = fixture(),
      original = g.state.value!;
    for (const ids of [[], ['a'], ['a', 'unknown'], ['a', '__background__']]) {
      g.selected.value = ids;
      expect(g.editable.value).toBe(false);
      g.transform(g.bounds.value!);
      g.rotate(90);
    }
    g.selected.value = ['a', 'b'];
    g.state.value = {
      ...original,
      composition: original.composition!.map((layer) => (layer.id === 'b' ? { ...layer, locked: true } : layer)),
    };
    expect(g.canRotate.value).toBe(false);
    g.rotate(90);
    expect(g.state.value!.shapes).toBe(original.shapes);
  });
  it('allows shared placement for blur regions while omitting unsupported rotation', () => {
    const g = fixture(),
      state = g.state.value!;
    state.effects = [
      {
        ...state.shapes[0]!,
        id: 'blur',
        kind: 'blur',
        mode: 'blur',
        shape: 'rectangle',
        strength: 60,
        feather: 0,
        tintOpacity: 0,
        color: '#000000',
      },
    ];
    insertScreenshotLayer(state, 'blur');
    g.selected.value = ['a', 'blur'];
    expect(g.editable.value).toBe(true);
    expect(g.canRotate.value).toBe(false);
    g.rotate(90);
    expect(g.state.value).toBe(state);
    g.transform({ ...g.bounds.value!, x: 0.2 });
    expect(g.state.value!.effects![0]!.transform.x).toBeCloseTo(0.2);
  });
  it('resets a live gesture when the selected members change', () => {
    const g = fixture();
    beginPropertyInteraction();
    g.rotate(45);
    g.selected.value = ['b', 'outside'];
    g.rotate(90);
    expect(g.state.value!.shapes[0]!.rotation).toBe(45);
    expect(g.state.value!.shapes[1]!.rotation).toBe(90);
    expect(g.state.value!.shapes[2]!.rotation).toBe(45);
    endPropertyInteraction();
  });
});
