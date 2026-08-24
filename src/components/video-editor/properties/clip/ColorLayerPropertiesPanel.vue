<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Plus, SlidersHorizontal } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Popover from '~/ui/popover/Popover.vue';
import BackgroundPresetComposer from '../canvas/BackgroundPresetComposer.vue';
import { useBackgroundPresets } from '../canvas/useBackgroundPresets';
import {
  gradientCssBackground,
  normalizeGradient,
  type BackgroundValue,
  type GradientBackground,
} from '../../composables/backgroundCatalog';
import type { ColorClip } from '~/media/shared/composition-types';
import type { ColorFill } from '~/media/shared/color-fill-types';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<{ clip: ColorClip }>();
const emit = defineEmits<{ (event: 'update', fill: ColorFill): void }>();
const { t } = useTranslate('CanvasPanel');
const activeKind = ref<'color' | 'gradient'>(props.clip.fill.kind);
watch(
  () => props.clip.id,
  () => {
    activeKind.value = props.clip.fill.kind;
  },
);

const applyPreset = (value: BackgroundValue) => {
  if (value.kind === 'color') emit('update', { kind: 'color', color: value.color });
  else if (value.kind === 'gradient') emit('update', { kind: 'gradient', gradient: normalizeGradient(value.gradient) });
};
const {
  colorPresets,
  gradientPresets,
  customColorValue,
  customGradientValue,
  editingPresetId,
  toggleColor,
  toggleGradient,
  isEditing,
  close: closeCustomEditor,
  saveColor,
  saveGradient,
  updateLiveColor,
  updateLiveGradient,
} = useBackgroundPresets(applyPreset);

const selectedColorPreset = computed(() =>
  props.clip.fill.kind === 'color'
    ? colorPresets.value.find((item) => {
        const fill = props.clip.fill;
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
  props.clip.fill.kind === 'gradient'
    ? gradientPresets.value.find((item) => {
        const fill = props.clip.fill;
        return fill.kind === 'gradient' && gradientsEqual(item.gradient, fill.gradient);
      })
    : undefined,
);
const gradientStyle = (gradient: GradientBackground) => ({ background: gradientCssBackground(gradient) });
</script>

<template>
  <section class="color-layer-panel">
    <ButtonGroup :aria-label="t('backgroundType')" class="kind-group">
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
            <button
              type="button"
              class="preset-tile custom-tile"
              :aria-label="t('customColor')"
              @click="editingPresetId = null"
            >
              <Plus :size="16" />
            </button>
          </template>
          <template #default="{ close }">
            <BackgroundPresetComposer
              kind="color"
              :color="selectedColorPreset?.color ?? customColorValue"
              :gradient="selectedGradientPreset?.gradient ?? customGradientValue"
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
            <button
              type="button"
              class="preset-tile custom-tile"
              :aria-label="t('customGradient')"
              @click="editingPresetId = null"
            >
              <Plus :size="16" />
            </button>
          </template>
          <template #default="{ close }">
            <BackgroundPresetComposer
              kind="gradient"
              :color="selectedColorPreset?.color ?? customColorValue"
              :gradient="selectedGradientPreset?.gradient ?? customGradientValue"
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
.color-layer-panel,
.preset-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kind-group {
  width: 100%;
}

.kind-group :deep(.btn-container) {
  flex: 1;
}

.kind-group :deep(.btn) {
  width: 100%;
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

.custom-tile {
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  background: var(--color-bg-surface);
}

@media (prefers-reduced-motion: reduce) {
  .preset-tile {
    transition: none;
  }
}
</style>
