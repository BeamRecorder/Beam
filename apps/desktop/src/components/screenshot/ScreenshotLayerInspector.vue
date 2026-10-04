<script setup lang="ts">
import ElementClipControls from '../editor/elements/ElementClipControls.vue';
import ScreenshotGroupInspector from './ScreenshotGroupInspector.vue';
import { DEFAULT_ZOOM_MOTION_BLUR } from '@beam/engine/zoom/zoom-types';
import BlurPropertiesPanel from '../editor/properties/clip/BlurPropertiesPanel.vue';
import ClipPropertiesPanel from '../editor/properties/clip/ClipPropertiesPanel.vue';
import CanvasPanel from '../editor/properties/canvas/CanvasPanel.vue';
import SettingsPanel from '../editor/properties/settings/SettingsPanel.vue';
import ScreenshotCursorControls from './ScreenshotCursorControls.vue';
import ZoomPanel from '../editor/properties/zoom/ZoomPanel.vue';
import ScreenshotLayerEffectPanel from './gradient/ScreenshotLayerEffectPanel.vue';
import ScreenshotPerspectiveControls from './ScreenshotPerspectiveControls.vue';
import type { ClipAppearance } from '@beam/engine/shared/composition-types';
import {
  updateScreenshotLayer,
  updateScreenshotBackground,
  updateScreenshotBackgroundBlur,
  setScreenshotLayerVisible,
  updateScreenshotWatermark,
} from '@beam/engine/screenshot/screenshot-layers';
import type { ScreenshotLayerInspectorProps } from './screenshot-layer-inspector-types';
const props = defineProps<ScreenshotLayerInspectorProps>();
const emit = defineEmits<{ handlesMuted: [value: boolean] }>();
const {
  state,
  selectedId,
  selectedIds,
  selectedLayer,
  panel,
  zooms,
  selectedImage,
  image,
  effects,
  appearance,
  rotate,
  transform,
  backgrounds,
  backgroundLibrary,
  cursors,
  layerEffects,
  busy,
  cropping,
  select,
  back,
} = props.editor;
</script>
<template>
  <fieldset v-if="state" class="layer-properties" :disabled="selectedLayer?.locked && panel !== 'settings'">
    <ScreenshotGroupInspector
      v-if="selectedIds.length > 1 && !['canvas', 'settings', 'layer-effect'].includes(panel)"
      :editor="editor"
      :bounds="bounds"
    />
    <template v-else>
      <ZoomPanel
        v-if="panel === 'zoom' && zooms.selected.value"
        still
        :selected-zoom="zooms.selected.value"
        :canvas-size="state.canvas"
        :can-generate="false"
        :has-automatic-zooms="false"
        :motion-blur="DEFAULT_ZOOM_MOTION_BLUR"
        @update="zooms.update"
      />
      <ScreenshotPerspectiveControls
        :disabled="busy || selectedLayer?.locked"
        v-if="selectedLayer && ['image', 'shapes', 'cursor'].includes(panel)"
        :model-value="selectedLayer.rotation3d"
        @update:model-value="updateScreenshotLayer(state!, selectedLayer.id, { rotation3d: $event })"
      />
      <ElementClipControls v-if="panel === 'shapes' || panel === 'cursor'" />
      <div v-if="panel === 'shapes' && effects.selected.value" class="effect-properties">
        <BlurPropertiesPanel
          :clip="{
            ...effects.selected.value,
            cornerRadius: effects.selected.value.cornerRadius ?? 0,
          }"
          @update="effects.update"
        />
      </div>
      <ClipPropertiesPanel
        :canvas-size="state.canvas"
        v-if="selectedImage && image && (panel === 'image' || panel === 'shapes')"
        hide-layout
        hide-crop
        :selected-clip="selectedImage"
        @update:appearance="appearance"
        @corner-radius-interaction="emit('handlesMuted', $event)"
        @update:shadow="
          appearance({
            shadowSize: $event.size,
            shadowBlur: $event.blur,
            shadowMode: $event.mode,
            shadowColor: $event.color,
            shadowDirection: $event.direction as ClipAppearance['shadowDirection'],
          })
        "
        @update:corner-radius="
          appearance({
            cornerRadius: $event as ClipAppearance['cornerRadius'],
          })
        "
        @update:is-mirrored="image.isMirrored = $event"
        @update:is-mirrored-y="image.isMirroredY = $event"
        @update:rotation="rotate"
        @update:clip-transform="transform"
        @reset:clip-transform="image.transform = { x: 0.06, y: 0.06, width: 0.88, height: 0.88 }"
      />
      <CanvasPanel
        v-else-if="panel === 'canvas'"
        still
        :selected-background="state.background"
        :background-groups="backgrounds"
        :blur-percent="state.blurPercent"
        :show-background="state.canvas.showBackground"
        :watermark="state.canvas.watermark"
        @update:selected-background="updateScreenshotBackground(state, $event)"
        @update:blur-percent="updateScreenshotBackgroundBlur(state, $event)"
        @update:show-background="setScreenshotLayerVisible(state, '__background__', $event)"
        @update:watermark="updateScreenshotWatermark(state, $event)"
        @import:background="backgroundLibrary.push($event)"
      />
      <template v-if="panel === 'cursor' && cursors.selected.value">
        <ScreenshotCursorControls
          :cursor="cursors.selected.value"
          :packs="cursors.packs.value"
          @update="cursors.update"
          @imported="cursors.registerPack"
        />
      </template>
      <SettingsPanel v-else-if="panel === 'settings'" hide-recorder @back-to-hud="back" />
      <ScreenshotLayerEffectPanel
        v-if="panel === 'layer-effect' && layerEffects.selected.value"
        :effect="layerEffects.selected.value"
        :disabled="busy || cropping || selectedLayer?.locked"
        @update="layerEffects.update"
        @remove="layerEffects.remove"
        @back="selectedId && select(selectedId)"
      />
    </template>
  </fieldset>
</template>
<style scoped>
.layer-properties {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.layer-properties:disabled {
  opacity: 0.65;
}
</style>
