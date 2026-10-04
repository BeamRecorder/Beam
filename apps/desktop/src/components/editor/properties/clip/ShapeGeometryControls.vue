<script setup lang="ts">
import { computed } from 'vue';
import { Spline } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import Select from '~/ui/select/Select.vue';
import ShapePicker from '../../elements/ShapePicker.vue';
import ArrowPicker from '../../elements/ArrowPicker.vue';
import VectorNodeControls from '../../elements/VectorNodeControls.vue';
import DrawingControls from '../../elements/DrawingControls.vue';
import { useElementEditor } from '../../elements/useElementEditor';
import { arrowVector, solidArrowPath } from '@beam/engine/shared/shape-vector-presets';
import { vectorFromSvg } from '@beam/engine/shared/shape-vector-svg';
import { ARROW_MARKERS } from '@beam/engine/shared/shape-vector-schema';
import type { ArrowMarker, ArrowPreset, ShapeVector } from '@beam/engine/shared/shape-vector-types';
import type { ShapeKind } from '@beam/engine/shared/shape-catalog';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { normalizeShapeLayerStyle, shapeLayerFill } from '@beam/engine/shared/shape-layer-style';
import type { ElementLayerPatch } from '../../elements/element-editor-types';
import { useTranslate } from '~/i18n/useTranslate';
const props = defineProps<{ clip: ShapeClip }>();
const emit = defineEmits<{ update: [patch: ElementLayerPatch] }>();
const editor = useElementEditor();
const { t } = useTranslate('Elements');
const { t: canvasText } = useTranslate('CanvasPanel');
const style = computed(() => normalizeShapeLayerStyle(props.clip));
const editing = computed(() => editor?.vectorEditing.value === props.clip.id);
const markers = computed(() => ARROW_MARKERS.map((value) => ({ value, label: t(`marker_${value}`) })));
const arrowPreset = computed(() => (style.value.vector ? style.value.vector.arrowPreset : 'solid'));
const chooseArrow = (preset: ArrowPreset) => {
  editor?.finishVector();
  emit('update', { family: 'arrow', preset: 'arrow', vector: arrowVector(preset) });
};
const updateVector = (patch: Partial<ShapeVector>) => {
  if (style.value.vector) emit('update', { vector: { ...style.value.vector, ...patch } });
};
const number = (value: string | number, key: 'strokeWidth' | 'markerSize') => {
  const n = Number(value);
  if (String(value).trim() && Number.isFinite(n) && n >= 1 && n <= 120) updateVector({ [key]: n });
};
const cornerRadius = (value: string | number) => {
  const n = Number(value);
  if (String(value).trim() && Number.isFinite(n) && n >= 0 && n <= 50) emit('update', { cornerRadius: n });
};
const solid = (key: 'arrowThickness' | 'arrowHeadSize', value: string | number) => {
  const n = Number(value),
    max = key === 'arrowThickness' ? 80 : 70;
  if (!String(value).trim() || !Number.isFinite(n) || n < 0 || n > max) return;
  const settings = { arrowThickness: style.value.arrowThickness, arrowHeadSize: style.value.arrowHeadSize, [key]: n };
  emit('update', {
    ...settings,
    ...(style.value.vector
      ? {
          vector: {
            ...vectorFromSvg(solidArrowPath(settings.arrowThickness, settings.arrowHeadSize)),
            arrowPreset: 'solid',
          },
        }
      : {}),
  });
};
const marker = (key: 'startMarker' | 'endMarker', value: string | number) => {
  if (ARROW_MARKERS.includes(value as ArrowMarker)) updateVector({ [key]: value as ArrowMarker });
};
</script>
<template>
  <div class="geometry">
    <ShapePicker
      v-if="style.family === 'shape'"
      :model-value="style.preset as ShapeKind"
      @update:model-value="
        editor?.finishVector();
        emit('update', { preset: $event, vector: null });
      "
    />
    <div v-if="style.family === 'shape' && style.preset === 'rounded-rectangle' && !style.vector" class="field">
      <span>{{ canvasText('shapeCornerRadius') }}</span
      ><Input
        :model-value="style.cornerRadius"
        type="number"
        size="xs"
        appearance="neutral"
        :min="0"
        :max="50"
        :step="1"
        :aria-label="canvasText('shapeCornerRadius')"
        @update:model-value="cornerRadius"
      />
    </div>
    <ArrowPicker
      v-if="style.family === 'arrow'"
      :model-value="style.family === 'arrow' ? arrowPreset : undefined"
      @update:model-value="chooseArrow"
    />
    <template v-if="style.family === 'arrow'">
      <template v-if="arrowPreset === 'solid' && !editing">
        <div v-for="key in ['arrowThickness', 'arrowHeadSize'] as const" :key="key" class="field">
          <span>{{ canvasText(key) }}</span
          ><Input
            :model-value="style[key]"
            type="number"
            appearance="neutral"
            size="xs"
            :min="0"
            :max="key === 'arrowThickness' ? 80 : 70"
            :step="1"
            :aria-label="canvasText(key)"
            @update:model-value="solid(key, $event)"
          />
        </div>
      </template>
    </template>
    <template v-if="style.vector && style.vector.contours.some((c) => !c.closed)">
      <div class="field">
        <span>{{ t('strokeWidth') }}</span
        ><Input
          :model-value="style.vector.strokeWidth"
          type="number"
          appearance="neutral"
          size="xs"
          :min="1"
          :max="120"
          :step="1"
          :aria-label="t('strokeWidth')"
          @update:model-value="number($event, 'strokeWidth')"
          ><template #suffix>px</template></Input
        >
      </div>
      <div v-for="key in ['startMarker', 'endMarker'] as const" :key="key" class="field">
        <span>{{ t(key) }}</span
        ><Select
          :model-value="style.vector[key]"
          :options="markers"
          size="compact"
          :label="t(key)"
          @update:model-value="marker(key, $event)"
        />
      </div>
      <div class="field">
        <span>{{ t('markerSize') }}</span
        ><Input
          :model-value="style.vector.markerSize"
          type="number"
          appearance="neutral"
          size="xs"
          :min="1"
          :max="120"
          :step="1"
          :aria-label="t('markerSize')"
          @update:model-value="number($event, 'markerSize')"
          ><template #suffix>px</template></Input
        >
      </div>
    </template>
    <DrawingControls
      v-if="clip.drawing && !style.vector"
      hide-color
      :model-value="{ ...clip.drawing, color: style.fillColor, fill: shapeLayerFill(style) }"
      @update:model-value="
        emit('update', { drawing: { ...clip.drawing, smoothing: $event.smoothing, strokeWidth: $event.strokeWidth } })
      "
    />
    <Button
      v-if="editor && !editing"
      :disabled="!editor.canvasSize.value"
      :icon="Spline"
      size="sm"
      variant="secondary"
      @click="editor.beginVector()"
      >{{ t('editNodes') }}</Button
    >
    <VectorNodeControls v-if="editing" />
  </div>
</template>
<style scoped>
.geometry {
  display: grid;
  gap: 12px;
}
.field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
</style>
