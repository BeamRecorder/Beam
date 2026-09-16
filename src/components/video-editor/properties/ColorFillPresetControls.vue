<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import AddTileButton from '~/ui/button/AddTileButton.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Popover from '~/ui/popover/Popover.vue';
import type { ColorFill } from '~/media/shared/color-fill-types';
import { useTranslate } from '~/i18n/useTranslate';
import {
  gradientCssBackground,
  normalizeGradient,
  type BackgroundValue,
  type GradientBackground,
} from '../composables/backgroundCatalog';
import BackgroundPresetComposer from './canvas/BackgroundPresetComposer.vue';
import { useBackgroundPresets } from './canvas/useBackgroundPresets';

const props = defineProps<{ modelValue: ColorFill; label?: string }>();
const emit = defineEmits<{ 'update:modelValue': [fill: ColorFill] }>();
const { t } = useTranslate('CanvasPanel');
const activeKind = ref<ColorFill['kind']>(props.modelValue.kind);

watch(
  () => props.modelValue.kind,
  (kind) => {
    activeKind.value = kind;
  },
);

const applyPreset = (value: BackgroundValue) => {
  if (value.kind === 'color') emit('update:modelValue', { kind: 'color', color: value.color });
  else if (value.kind === 'gradient')
    emit('update:modelValue', { kind: 'gradient', gradient: normalizeGradient(value.gradient) });
};
const {
  colorPresets,
  gradientPresets,
  customColorValue,
  customGradientValue,
  toggleColor,
  toggleGradient,
  beginAdd,
  isEditing,
  close: closeCustomEditor,
  saveColor,
  saveGradient,
  updateLiveColor,
  updateLiveGradient,
} = useBackgroundPresets(applyPreset);

const selectedColorPreset = computed(() =>
  props.modelValue.kind === 'color'
    ? colorPresets.value.find((item) => {
        const fill = props.modelValue;
        return fill.kind === 'color' && item.color.toLowerCase() === fill.color.toLowerCase();
      })
    : undefined,
);
const gradientsEqual = (left: GradientBackground, right: GradientBackground) =>
  left.type === right.type &&
  left.angle === right.angle &&
  left.stops.length === right.stops.length &&
  left.stops.every((stop, index) => {
    const other = right.stops[index];
    return (
      other !== undefined &&
      stop.position === other.position &&
      stop.color.toLowerCase() === other.color.toLowerCase() &&
      stop.alpha === other.alpha
    );
  });
const selectedGradientPreset = computed(() =>
  props.modelValue.kind === 'gradient'
    ? gradientPresets.value.find((item) => {
        const fill = props.modelValue;
        return fill.kind === 'gradient' && gradientsEqual(item.gradient, fill.gradient);
      })
    : undefined,
);
const gradientStyle = (gradient: GradientBackground) => ({ background: gradientCssBackground(gradient) });
</script>

<template>
  <section class="fill-preset-controls">
    <span v-if="label" class="section-label">{{ label }}</span>
    <ButtonGroup full :columns="2" :aria-label="label ?? t('backgroundType')" class="kind-group">
      <Button size="xs" :variant="activeKind === 'color' ? 'primary' : 'ghost'" @click="activeKind = 'color'">
        {{ t('color') }}
      </Button>
      <Button size="xs" :variant="activeKind === 'gradient' ? 'primary' : 'ghost'" @click="activeKind = 'gradient'">
        {{ t('gradient') }}
      </Button>
    </ButtonGroup>

    <div v-if="activeKind === 'color'" class="preset-section">
      <div class="preset-grid">
        <Popover block :match-trigger-width="false" flush @toggle="(open) => !open && closeCustomEditor()">
          <template #trigger>
            <AddTileButton :label="t('customColor')" @click="beginAdd('color')" />
          </template>
          <template #default="{ close }">
            <BackgroundPresetComposer
              kind="color"
              :color="customColorValue"
              :gradient="customGradientValue"
              @add-color="
                (value) => {
                  void saveColor(value);
                  close();
                }
              "
              @update-color="updateLiveColor"
              @close="
                closeCustomEditor();
                close();
              "
            />
          </template>
        </Popover>
        <button
          v-for="item in colorPresets"
          :key="item.id"
          type="button"
          class="preset-tile"
          :class="{ active: selectedColorPreset?.id === item.id, editing: isEditing(item.id) }"
          :style="{ background: item.color }"
          :aria-label="item.name"
          @click="applyPreset(item)"
        />
      </div>
      <Popover
        v-if="selectedColorPreset"
        block
        :match-trigger-width="false"
        flush
        @toggle="(open) => !open && closeCustomEditor()"
      >
        <template #trigger>
          <Button
            variant="secondary"
            size="sm"
            block
            :icon="SlidersHorizontal"
            :aria-pressed="isEditing(selectedColorPreset.id)"
            @click="toggleColor(selectedColorPreset)"
          >
            {{ isEditing(selectedColorPreset.id) ? t('closeEditing') : t('edit') }}
          </Button>
        </template>
        <template #default="{ close }">
          <BackgroundPresetComposer
            kind="color"
            :color="selectedColorPreset.color"
            :gradient="customGradientValue"
            @add-color="
              (value) => {
                void saveColor(value);
                close();
              }
            "
            @update-color="updateLiveColor"
            @close="
              closeCustomEditor();
              close();
            "
          />
        </template>
      </Popover>
    </div>

    <div v-else class="preset-section">
      <div class="preset-grid">
        <Popover block :match-trigger-width="false" flush @toggle="(open) => !open && closeCustomEditor()">
          <template #trigger>
            <AddTileButton :label="t('customGradient')" @click="beginAdd('gradient')" />
          </template>
          <template #default="{ close }">
            <BackgroundPresetComposer
              kind="gradient"
              :color="customColorValue"
              :gradient="customGradientValue"
              @add-gradient="
                (value) => {
                  void saveGradient(value);
                  close();
                }
              "
              @update-gradient="updateLiveGradient"
              @close="
                closeCustomEditor();
                close();
              "
            />
          </template>
        </Popover>
        <button
          v-for="item in gradientPresets"
          :key="item.id"
          type="button"
          class="preset-tile"
          :class="{ active: selectedGradientPreset?.id === item.id, editing: isEditing(item.id) }"
          :style="gradientStyle(item.gradient)"
          :aria-label="item.name"
          @click="applyPreset(item)"
        />
      </div>
      <Popover
        v-if="selectedGradientPreset"
        block
        :match-trigger-width="false"
        flush
        @toggle="(open) => !open && closeCustomEditor()"
      >
        <template #trigger>
          <Button
            variant="secondary"
            size="sm"
            block
            :icon="SlidersHorizontal"
            :aria-pressed="isEditing(selectedGradientPreset.id)"
            @click="toggleGradient(selectedGradientPreset)"
          >
            {{ isEditing(selectedGradientPreset.id) ? t('closeEditing') : t('edit') }}
          </Button>
        </template>
        <template #default="{ close }">
          <BackgroundPresetComposer
            kind="gradient"
            :color="customColorValue"
            :gradient="selectedGradientPreset.gradient"
            @add-gradient="
              (value) => {
                void saveGradient(value);
                close();
              }
            "
            @update-gradient="updateLiveGradient"
            @close="
              closeCustomEditor();
              close();
            "
          />
        </template>
      </Popover>
    </div>
  </section>
</template>

<style scoped>
.fill-preset-controls,
.preset-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.preset-tile {
  position: relative;
  aspect-ratio: 1;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.preset-tile:hover:not(.active) {
  border-color: var(--color-border-hover);
  transform: translateY(-1px);
}

.preset-tile.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.preset-tile.editing::after {
  position: absolute;
  inset: 3px;
  border: 1px dashed color-mix(in srgb, var(--text-primary) 70%, transparent);
  border-radius: calc(var(--radius-md) - 3px);
  content: '';
}

@media (prefers-reduced-motion: reduce) {
  .preset-tile {
    transition: none;
  }
}
</style>
