<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Input from '~/ui/input/Input.vue';
import type { CropPixels } from '@beam/engine/shared/crop-types';
import type { NormalizedCrop } from '@beam/engine/shared/composition-types';
import type { CropField, CropUnit } from '../composition/crop/crop-types';
import { changeCropInput, cropInputValue } from '../composition/crop/crop-input';

const props = defineProps<{ measurements: CropPixels }>();
const emit = defineEmits<{ update: [crop: NormalizedCrop] }>();
const unit = ref<CropUnit>('px');
const panel = ref<HTMLElement | null>(null);
const inputs = new Map<CropField, InstanceType<typeof Input>>();
const setInput = (field: CropField, input: InstanceType<typeof Input> | null) => {
  if (input) inputs.set(field, input);
  else inputs.delete(field);
};
const flush = () => {
  for (const input of inputs.values()) input.flush();
};
defineExpose({ flush });
onMounted(() => panel.value?.querySelector<HTMLInputElement>('input')?.focus());
const { t } = useI18n();
const fields: CropField[] = ['top', 'bottom', 'left', 'right', 'width', 'height'];
const units = [
  { value: 'px', label: 'px' },
  { value: '%', label: '%' },
];
const label = (field: CropField) =>
  t(`${field === 'width' || field === 'height' ? 'ScreenshotEditor' : 'CropControls'}.${field}`);
const update = (field: CropField, value: string | number) => {
  const next = changeCropInput(props.measurements, field, value, unit.value);
  if (next) emit('update', next);
};
</script>

<template>
  <div
    ref="panel"
    class="crop-numeric-fields"
    role="dialog"
    aria-modal="false"
    :aria-label="t('EditorCanvas.editCrop')"
  >
    <label v-for="field in fields" :key="field" class="crop-field">
      <span>{{ label(field) }}</span>
      <Input
        :ref="(input) => setInput(field, input as InstanceType<typeof Input> | null)"
        type="number"
        size="sm"
        commit-on-blur
        :model-value="cropInputValue(measurements, field, unit)"
        :aria-label="label(field)"
        :unit="unit"
        :unit-options="units"
        :unit-label="t('TransformControls.unit')"
        :step="unit === 'px' ? 1 : 0.01"
        @update:unit="unit = $event === '%' ? '%' : 'px'"
        @update:model-value="update(field, $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.crop-numeric-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 256px;
  max-width: calc(100vw - 48px);
  padding: 12px;
  box-sizing: border-box;
}
.crop-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
</style>
