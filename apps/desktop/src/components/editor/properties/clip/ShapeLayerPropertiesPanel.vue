<script setup lang="ts">
import ElementTextControls from '../../elements/ElementTextControls.vue';
import DrawingControls from '../../elements/DrawingControls.vue';
import MediaOrientationControls from '../shared/MediaOrientationControls.vue';
import ShapePicker from '../../elements/ShapePicker.vue';
import { computed, ref } from 'vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Switch from '~/ui/switch/Switch.vue';
import ShadowDirectionGroup from '../cursor/ShadowDirectionGroup.vue';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { defaultShapePresetFor, normalizeShapeLayerStyle, shapeLayerFill } from '@beam/engine/shared/shape-layer-style';
import type { ColorFill } from '@beam/engine/shared/color-fill-types';
import type { ShapeKind } from '@beam/engine/shared/shape-catalog';
import type { ShapeLayerFamily, ShapeLayerStyle } from '@beam/engine/shared/shape-layer-types';
import { useTranslate } from '~/i18n/useTranslate';
import ColorFillPresetControls from '../ColorFillPresetControls.vue';

const props = defineProps<{ clip: ShapeClip }>();
const emit = defineEmits<{ update: [patch: Partial<ShapeLayerStyle>] }>();
const { t } = useTranslate('CanvasPanel');
const { t: clipText } = useTranslate('ClipPropertiesPanel');
const { t: borderText } = useTranslate('BorderAndFrameControls');
const open = ref({ placement: true, geometry: true, fill: true, border: false, opacity: false, shadow: false });
const style = computed(() => normalizeShapeLayerStyle(props.clip));
const shapePreset = computed(() => style.value.preset as ShapeKind);
const fill = computed(() => shapeLayerFill(style.value));
const update = (patch: Partial<ShapeLayerStyle>) => emit('update', patch);
const updateFill = (value: ColorFill) =>
  update({
    fill: value,
    ...(value.kind === 'color' ? { fillColor: value.color } : {}),
  });
const selectFamily = (family: ShapeLayerFamily) => update({ family, preset: defaultShapePresetFor(family) });
</script>

<template>
  <section class="shape-panel">
    <Accordion
      v-model="open.placement"
      appearance="inspector"
      :title="clipText('placement')"
      data-element-section="placement"
    >
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
      :title="t('shapeFamily')"
      data-element-section="geometry"
    >
      <div class="control-stack">
        <ButtonGroup
          v-if="style.family === 'shape' || style.family === 'arrow'"
          full
          :columns="2"
          size="xs"
          :aria-label="t('shapeFamily')"
        >
          <Button
            size="xs"
            :variant="style.family === 'shape' ? 'selected' : 'secondary'"
            @click="selectFamily('shape')"
            >{{ t('shapes') }}</Button
          >
          <Button
            size="xs"
            :variant="style.family === 'arrow' ? 'selected' : 'secondary'"
            @click="selectFamily('arrow')"
            >{{ t('arrows') }}</Button
          >
        </ButtonGroup>
        <ShapePicker
          v-if="style.family === 'shape'"
          :model-value="shapePreset"
          @update:model-value="update({ preset: $event })"
        />
        <BigSlider
          :display-precision="2"
          v-if="style.family === 'shape' && style.preset === 'rounded-rectangle'"
          :model-value="style.cornerRadius"
          :min="0"
          :max="50"
          :step="1"
          :default-value="16"
          :label="t('shapeCornerRadius')"
          @update:model-value="update({ cornerRadius: $event })"
        />
        <template v-if="style.family === 'arrow'">
          <BigSlider
            :display-precision="2"
            :model-value="style.arrowThickness"
            :min="0"
            :max="80"
            :step="1"
            :default-value="36"
            :label="t('arrowThickness')"
            @update:model-value="update({ arrowThickness: $event })"
          />
          <BigSlider
            :display-precision="2"
            :model-value="style.arrowHeadSize"
            :min="0"
            :max="70"
            :step="1"
            :default-value="38"
            :label="t('arrowHeadSize')"
            @update:model-value="update({ arrowHeadSize: $event })"
          />
        </template>
        <DrawingControls
          v-if="clip.drawing && style.family === 'drawing'"
          :model-value="{ ...clip.drawing, color: style.fillColor, fill }"
          @update:model-value="
            update({
              fill: $event.fill,
              ...($event.fill?.kind === 'color' ? { fillColor: $event.fill.color } : {}),
              drawing: { ...clip.drawing, smoothing: $event.smoothing, strokeWidth: $event.strokeWidth },
            })
          "
        />
      </div>
    </Accordion>
    <Accordion
      v-if="style.family !== 'text' && style.family !== 'drawing'"
      v-model="open.fill"
      appearance="inspector"
      :title="t('fillColor')"
      data-element-section="fill"
    >
      <template #actions
        ><Switch
          :model-value="style.fillEnabled"
          :aria-label="t('fillColor')"
          @update:model-value="update({ fillEnabled: $event })"
      /></template>
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
          @update:model-value="update({ borderColor: $event })"
        />
        <BigSlider
          :display-precision="2"
          :model-value="style.borderWidth"
          :min="0"
          :max="40"
          :step="1"
          :default-value="0"
          :label="t('borderWidth')"
          @update:model-value="update({ borderWidth: $event })"
        />
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
        <BigSlider
          :display-precision="2"
          :model-value="style.opacity"
          :min="0"
          :max="100"
          :step="1"
          :default-value="70"
          :label="t('itemOpacity')"
          @update:model-value="update({ opacity: $event })"
        />
        <BigSlider
          :display-precision="2"
          v-if="style.family !== 'text' && style.family !== 'drawing'"
          :model-value="style.backdropBlur"
          :min="0"
          :max="100"
          :step="1"
          :default-value="35"
          :label="t('colorLayerBackdropBlur')"
          @update:model-value="update({ backdropBlur: $event })"
        />
      </div>
    </Accordion>
    <Accordion
      v-if="style.family !== 'text'"
      v-model="open.shadow"
      appearance="inspector"
      :title="t('colorLayerShadow')"
      data-element-section="shadow"
    >
      <template #actions
        ><Switch
          :model-value="style.shadowEnabled"
          :aria-label="t('colorLayerShadow')"
          @update:model-value="update({ shadowEnabled: $event })"
      /></template>
      <div v-if="style.shadowEnabled" class="control-stack">
        <ColorPicker
          :model-value="style.shadowColor"
          :label="t('shadowColor')"
          @update:model-value="update({ shadowColor: $event })"
        />
        <BigSlider
          :display-precision="2"
          :model-value="style.shadowBlur"
          :min="0"
          :max="96"
          :step="1"
          :default-value="32"
          :label="t('shadowBlur')"
          @update:model-value="update({ shadowBlur: $event })"
        />
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
.rotation-row {
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
