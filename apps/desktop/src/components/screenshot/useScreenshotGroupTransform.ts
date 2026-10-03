import { computed, watch } from 'vue';
import type { Ref } from 'vue';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { transformScreenshotGroup } from '@beam/engine/screenshot/screenshot-groups';
import { rotateScreenshotGroup } from '@beam/engine/screenshot/screenshot-group-rotation';
import { propertyInteractionActive } from '~/composables/property-interaction';
import { screenshotLayerRotation } from './screenshot-layer-geometry';
import type { ScreenshotGroupTransformGesture } from './screenshot-group-inspector-types';

export function useScreenshotGroupTransform(
  state: Ref<ScreenshotState | null>,
  selected: Ref<string[]>,
  bounds: () => NormalizedTransform | null,
  disabled: () => boolean,
) {
  const members = computed(() =>
    state.value ? screenshotLayers(state.value).filter((layer) => selected.value.includes(layer.id)) : [],
  );
  const editable = computed(
    () =>
      !disabled() &&
      !!bounds() &&
      members.value.length >= 2 &&
      members.value.length === selected.value.length &&
      members.value.every((layer) => !layer.locked && !['background', 'watermark', 'zoom'].includes(layer.kind)),
  );
  const canRotate = computed(() => editable.value && members.value.every((layer) => layer.kind !== 'effect'));
  const rotation = computed(() =>
    state.value && members.value[0] ? screenshotLayerRotation(state.value, members.value[0].id) : 0,
  );
  let gesture: ScreenshotGroupTransformGesture | null = null;
  watch(
    [propertyInteractionActive, selected],
    () => {
      gesture = null;
    },
    { flush: 'sync' },
  );
  const transform = (value: NormalizedTransform) => {
    const from = bounds();
    if (!state.value || !from || !editable.value) return;
    if (propertyInteractionActive.value && !gesture)
      gesture = { state: state.value, bounds: from, rotation: rotation.value };
    const initial = gesture ?? { state: state.value, bounds: from };
    state.value = transformScreenshotGroup(initial.state, selected.value, initial.bounds, value);
  };
  const rotate = (value: number) => {
    const currentBounds = bounds();
    if (!state.value || !currentBounds || !canRotate.value || !Number.isFinite(value)) return;
    if (propertyInteractionActive.value && !gesture)
      gesture = { state: state.value, bounds: currentBounds, rotation: rotation.value };
    const initial = gesture ?? { state: state.value, bounds: currentBounds, rotation: rotation.value };
    state.value = rotateScreenshotGroup(initial.state, selected.value, initial.bounds, value - initial.rotation);
  };
  return { editable, canRotate, rotation, transform, rotate };
}
