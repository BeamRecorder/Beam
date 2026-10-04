<script setup lang="ts">
import ElementTextControls from '../../elements/ElementTextControls.vue';
import ShapeGeometryControls from './ShapeGeometryControls.vue';
import TransformControls from '../shared/TransformControls.vue';
import { useElementEditor } from '../../elements/useElementEditor';
import type { ElementLayerPatch } from '../../elements/element-editor-types';
import Input from '~/ui/input/Input.vue';
import MediaOrientationControls from '../shared/MediaOrientationControls.vue';
import { computed, ref } from 'vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Switch from '~/ui/switch/Switch.vue';
import ShadowDirectionGroup from '../cursor/ShadowDirectionGroup.vue';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { normalizeShapeLayerStyle, shapeLayerFill } from '@beam/engine/shared/shape-layer-style';
import type { ColorFill } from '@beam/engine/shared/color-fill-types';
import { useTranslate } from '~/i18n/useTranslate';
import ColorFillPresetControls from '../ColorFillPresetControls.vue';

const props = defineProps<{ clip: ShapeClip; canvasSize?: { width: number; height: number } }>();
const emit = defineEmits<{ update: [patch: ElementLayerPatch] }>();
const { t } = useTranslate('CanvasPanel');
const { t: clipText } = useTranslate('ClipPropertiesPanel');
const { t: elementText } = useTranslate('Elements');
const { t: borderText } = useTranslate('BorderAndFrameControls');
const open = ref({
  placement: props.clip.family !== 'arrow' && props.clip.family !== 'drawing',
  geometry: true,
  fill: true,
  border: false,
  opacity: false,
  shadow: false,
});
const style = computed(() => normalizeShapeLayerStyle(props.clip));
const editor = useElementEditor();
const canvas = computed(() => props.canvasSize ?? editor?.canvasSize.value);
const fill = computed(() => shapeLayerFill(style.value));
const update = (patch: ElementLayerPatch) => emit('update', patch);
const updateFill = (value: ColorFill) =>
  update({
    fill: value,
    ...(value.kind === 'color' ? { fillColor: value.color } : {}),
  });
const number = (value: string | number, key: keyof ElementLayerPatch, max: number) => {
  const n = Number(value);
  if (String(value).trim() && Number.isFinite(n) && n >= 0 && n <= max) update({ [key]: n });
};
</script>

<template>
  <section class="shape-panel">
    <Accordion
      v-model="open.placement"
      appearance="inspector"
      :title="clipText('placement')"
      data-element-section="placement"
    >
      <TransformControls
        v-if="canvas"
        :model-value="clip.transform"
        :canvas-size="canvas"
        @update:model-value="update({ transform: $event })"
      />
      <div class="rotation-row">
        <span class="rotation-label">{{ t('shapeRotation') }}</span>
        <MediaOrientationControls
          :rotation="style.rotation"
          :show-mirroring="false"
          @update:rotation="update({ rotation: $event })"
        />
      </div>
    </Accordion>
    <ElementTextControls
      v-if="style.family === 'text'"
      :key="clip.id"
      :clip="clip"
      @update="update({ text: $event })"
    />
    <Accordion
      v-if="style.family !== 'text'"
      v-model="open.geometry"
      appearance="inspector"
      :title="style.family === 'shape' ? t('shapeFamily') : elementText('path')"
      data-element-section="geometry"
    >
      <ShapeGeometryControls :clip="clip" @update="update" />
    </Accordion>
    <Accordion
      v-if="style.family !== 'text'"
      v-model="open.fill"
      appearance="inspector"
      :title="elementText('appearance')"
      data-element-section="fill"
    >
      <div class="property-toggle">
        <span>{{ t('fillColor') }}</span
        ><Switch
          :model-value="style.fillEnabled"
          :aria-label="t('fillColor')"
          @update:model-value="update({ fillEnabled: $event })"
        />
      </div>
      <ColorFillPresetControls
        v-if="style.fillEnabled"
        :model-value="fill"
        :label="t('fillColor')"
        @update:model-value="updateFill"
      />
    </Accordion>
    <Accordion
      v-if="style.family !== 'text'"
      v-model="open.border"
      appearance="inspector"
      :title="borderText('border')"
      data-element-section="border"
    >
      <div class="control-stack">
        <ColorPicker
          :model-value="style.borderColor"
          :label="t('borderColor')"
          show-label
          @update:model-value="update({ borderColor: $event })"
        />
        <div class="number-field">
          <span>{{ t('borderWidth') }}</span
          ><Input
            :model-value="style.borderWidth"
            type="number"
            appearance="neutral"
            size="xs"
            :min="0"
            :max="40"
            :step="1"
            :aria-label="t('borderWidth')"
            @update:model-value="number($event, 'borderWidth', 40)"
            ><template #suffix>px</template></Input
          >
        </div>
      </div>
    </Accordion>
    <Accordion v-model="open.opacity" appearance="inspector" :title="t('itemOpacity')" data-element-section="opacity">
      <div class="property-toggle">
        <span>{{ t('itemOpacity') }}</span>
        <Switch
          :model-value="style.opacityEnabled"
          :aria-label="t('itemOpacity')"
          @update:model-value="update({ opacityEnabled: $event })"
        />
      </div>
      <div v-if="style.opacityEnabled" class="control-stack">
        <div class="number-field">
          <span>{{ t('itemOpacity') }}</span
          ><Input
            :model-value="style.opacity"
            type="number"
            appearance="neutral"
            size="xs"
            :min="0"
            :max="100"
            :step="1"
            :aria-label="t('itemOpacity')"
            @update:model-value="number($event, 'opacity', 100)"
            ><template #suffix>%</template></Input
          >
        </div>
        <div v-if="style.family !== 'text' && style.family !== 'drawing'" class="number-field">
          <span>{{ t('colorLayerBackdropBlur') }}</span
          ><Input
            :model-value="style.backdropBlur"
            type="number"
            appearance="neutral"
            size="xs"
            :min="0"
            :max="100"
            :step="1"
            :aria-label="t('colorLayerBackdropBlur')"
            @update:model-value="number($event, 'backdropBlur', 100)"
            ><template #suffix>px</template></Input
          >
        </div>
      </div>
    </Accordion>
    <Accordion
      v-if="style.family !== 'text'"
      v-model="open.shadow"
      appearance="inspector"
      :title="t('colorLayerShadow')"
      data-element-section="shadow"
    >
      <div class="property-toggle">
        <span>{{ t('colorLayerShadow') }}</span
        ><Switch
          :model-value="style.shadowEnabled"
          :aria-label="t('colorLayerShadow')"
          @update:model-value="update({ shadowEnabled: $event })"
        />
      </div>
      <div v-if="style.shadowEnabled" class="control-stack">
        <ColorPicker
          :model-value="style.shadowColor"
          :label="t('shadowColor')"
          @update:model-value="update({ shadowColor: $event })"
        />
        <div class="number-field">
          <span>{{ t('shadowBlur') }}</span
          ><Input
            :model-value="style.shadowBlur"
            type="number"
            appearance="neutral"
            size="xs"
            :min="0"
            :max="96"
            :step="1"
            :aria-label="t('shadowBlur')"
            @update:model-value="number($event, 'shadowBlur', 96)"
            ><template #suffix>px</template></Input
          >
        </div>
        <ShadowDirectionGroup
          :model-value="style.shadowDirection"
          @update:model-value="update({ shadowDirection: $event })"
        />
      </div>
    </Accordion>
    <ElementTextControls
      v-if="style.family !== 'text'"
      :key="clip.id"
      :clip="clip"
      @update="update({ text: $event })"
    />
  </section>
</template>
<style scoped>
.shape-panel {
  display: grid;
  gap: 0;
  min-width: 0;
}
.property-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.control-stack {
  display: grid;
  gap: 12px;
}
.number-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
.rotation-row {
  margin-top: 16px;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.rotation-label {
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
</style>
