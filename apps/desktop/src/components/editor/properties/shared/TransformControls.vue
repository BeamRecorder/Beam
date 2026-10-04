<script setup lang="ts">
import { computed, ref } from 'vue';
import { Link, Unlink } from '@lucide/vue';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import {
  alignTransformToCanvas,
  editTransformPlacement,
  editTransformPixelSize,
  transformPixelSize,
  getTransformAlignment,
} from '@beam/engine/layout/transform-placement';
import type { AlignmentAxis } from '@beam/engine/layout/transform-placement-types';
import AlignmentPad from '~/ui/alignment-pad/AlignmentPad.vue';
import Input from '~/ui/input/Input.vue';
import Select from '~/ui/select/Select.vue';
import Button from '~/ui/button/Button.vue';
import MediaOrientationControls from './MediaOrientationControls.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { TransformControlsProps, TransformControlsEmits } from './transform-controls-types';

const props = defineProps<TransformControlsProps>();
const emit = defineEmits<TransformControlsEmits>();
const { t } = useTranslate('TransformControls');
const { t: clipText } = useTranslate('ClipPropertiesPanel');
const locked = ref(true);
const sizeUnit = ref('px');
const unitOptions = [
  { value: 'px', label: 'px' },
  { value: '%', label: '%' },
];
const changeSizeUnit = (unit: string) => {
  if (unit === 'px' || unit === '%') sizeUnit.value = unit;
};
const alignment = computed(() => getTransformAlignment(props.modelValue));
const padValue = computed(() => {
  const { x, y } = alignment.value;
  return x === null || y === null ? null : { x, y };
});
const labels = computed(() => ({
  group: t('alignment'),
  left: t('left'),
  center: t('center'),
  right: t('right'),
  top: t('top'),
  middle: t('middle'),
  bottom: t('bottom'),
}));
const horizontalOptions = computed(() => [
  { value: 0, label: t('left') },
  { value: 0.5, label: t('center') },
  { value: 1, label: t('right') },
]);
const verticalOptions = computed(() => [
  { value: 0, label: t('top') },
  { value: 0.5, label: t('middle') },
  { value: 1, label: t('bottom') },
]);
const edit = (key: keyof NormalizedTransform, value: string | number) => {
  if (String(value).trim() === '') return;
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  emit(
    'update:modelValue',
    (key === 'width' || key === 'height') && sizeUnit.value === 'px'
      ? editTransformPixelSize(props.modelValue, { [key]: number }, props.canvasSize, locked.value)
      : editTransformPlacement(props.modelValue, { [key]: number / 100 }, locked.value),
  );
};
const alignAxis = (key: 'x' | 'y', value: string | number) => {
  const number = Number(value);
  if (number !== 0 && number !== 0.5 && number !== 1) return;
  const other = key === 'x' ? 'y' : 'x';
  const next = alignTransformToCanvas(props.modelValue, { x: 0.5, y: 0.5, [key]: number as AlignmentAxis });
  emit('update:modelValue', { ...next, [other]: props.modelValue[other] });
};
const pixelSize = computed(() => transformPixelSize(props.modelValue, props.canvasSize));
const percent = (value: number) => Math.round(value * 10000) / 100;
</script>

<template>
  <div class="transform-controls">
    <div class="property-row">
      <span class="property-label">{{ t('position') }}</span>
      <div class="number-pair">
        <Input
          :model-value="percent(modelValue.x)"
          type="number"
          appearance="neutral"
          size="xs"
          commit-on-blur
          :min="-300"
          :max="300"
          :step="1"
          :aria-label="clipText('horizontal')"
          @update:model-value="edit('x', $event)"
        >
          <template #prefix>X</template><template #suffix>%</template>
        </Input>
        <Input
          :model-value="percent(modelValue.y)"
          type="number"
          appearance="neutral"
          size="xs"
          commit-on-blur
          :min="-300"
          :max="300"
          :step="1"
          :aria-label="clipText('vertical')"
          @update:model-value="edit('y', $event)"
        >
          <template #prefix>Y</template><template #suffix>%</template>
        </Input>
      </div>
    </div>
    <div class="property-row">
      <span class="property-label">{{ t('alignment') }}</span>
      <div class="alignment-controls">
        <div class="axis-options">
          <Select
            :model-value="alignment.x"
            :options="horizontalOptions"
            :placeholder="clipText('custom')"
            :label="clipText('horizontal')"
            :aria-label="clipText('horizontal')"
            size="compact"
            @update:model-value="alignAxis('x', $event)"
          />
          <Select
            :model-value="alignment.y"
            :options="verticalOptions"
            :placeholder="clipText('custom')"
            :label="clipText('vertical')"
            :aria-label="clipText('vertical')"
            size="compact"
            @update:model-value="alignAxis('y', $event)"
          />
        </div>
        <AlignmentPad
          :model-value="padValue"
          :labels="labels"
          @update:model-value="emit('update:modelValue', alignTransformToCanvas(modelValue, $event))"
        />
      </div>
    </div>
    <div v-if="showMirroring" class="property-row">
      <span class="property-label">{{ t('rotation') }}</span>
      <MediaOrientationControls
        :mirrored="mirrored"
        :mirrored-y="mirroredY"
        :rotation="rotation"
        @update:mirrored="emit('update:mirrored', $event)"
        @update:mirrored-y="emit('update:mirroredY', $event)"
        @update:rotation="emit('update:rotation', $event)"
      />
    </div>
    <div class="property-row">
      <div class="property-label size-label">
        <span>{{ clipText('size') }}</span>
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="locked ? Link : Unlink"
          :aria-label="t('lockAspectRatio')"
          :title="t('lockAspectRatio')"
          :aria-pressed="locked"
          @click="locked = !locked"
        />
      </div>
      <div class="size-controls">
        <div class="number-pair">
          <Input
            :model-value="sizeUnit === 'px' ? Math.round(pixelSize.width * 100) / 100 : percent(modelValue.width)"
            type="number"
            appearance="neutral"
            size="xs"
            commit-on-blur
            :min="sizeUnit === 'px' ? canvasSize.width * 0.02 : 2"
            :max="sizeUnit === 'px' ? canvasSize.width * 4 : 400"
            :step="1"
            :aria-label="t('width')"
            :unit="sizeUnit"
            :unit-options="unitOptions"
            :unit-label="`${t('width')} · ${t('unit')}`"
            @update:unit="changeSizeUnit"
            @update:model-value="edit('width', $event)"
          >
            <template #prefix>W</template>
          </Input>
          <Input
            :model-value="sizeUnit === 'px' ? Math.round(pixelSize.height * 100) / 100 : percent(modelValue.height)"
            type="number"
            appearance="neutral"
            size="xs"
            commit-on-blur
            :min="sizeUnit === 'px' ? canvasSize.height * 0.02 : 2"
            :max="sizeUnit === 'px' ? canvasSize.height * 4 : 400"
            :step="1"
            :aria-label="t('height')"
            :unit="sizeUnit"
            :unit-options="unitOptions"
            :unit-label="`${t('height')} · ${t('unit')}`"
            @update:unit="changeSizeUnit"
            @update:model-value="edit('height', $event)"
          >
            <template #prefix>H</template>
          </Input>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transform-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.property-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.property-label {
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  overflow-wrap: anywhere;
}
.number-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}
.alignment-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}
.axis-options {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}
.size-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.size-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.size-controls .number-pair {
  flex: 1;
}
</style>
