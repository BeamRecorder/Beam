<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, PenTool, Search } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import Popover from '~/ui/popover/Popover.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { createFuzzySearchEngine } from '~/ui/select/fuzzy-search';
import { ARROW_CATALOG } from '@beam/engine/shared/arrow-catalog';
import { arrowVector } from '@beam/engine/shared/shape-vector-presets';
import { vectorStrokePathData } from '@beam/engine/shared/shape-vector-stroke';
import { vectorMarkerPaths } from '@beam/engine/shared/shape-vector-markers';
import type { ArrowPreset } from '@beam/engine/shared/shape-vector-types';
import { useTranslate } from '~/i18n/useTranslate';
const props = defineProps<{ modelValue?: ArrowPreset; disabled?: boolean; allowDrawing?: boolean; active?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [preset: ArrowPreset]; draw: [] }>();
const { t } = useTranslate('Elements');
const query = ref('');
const options = ARROW_CATALOG.map((definition) => {
  const vector = arrowVector(definition.id),
    width = 100,
    height = width / definition.aspectRatio;
  return {
    id: definition.id,
    path: vectorStrokePathData(vector, width, height, 0.55),
    closed: vector.contours.every((c) => c.closed),
    viewBox: `-12 -12 ${width + 24} ${height + 24}`,
    markers: vectorMarkerPaths(vector, width, height, 0.55),
  };
});
const search = computed(() => createFuzzySearchEngine(options, (option) => [t(`arrowPreset_${option.id}`), option.id]));
const visible = computed(() => search.value.search(query.value));
const selected = computed(() => options.find((option) => option.id === props.modelValue));
const choose = (preset: ArrowPreset, close: () => void) => {
  emit('update:modelValue', preset);
  close();
};
</script>
<template>
  <Popover block :disabled="disabled" :match-trigger-width="false" @toggle="!$event && (query = '')">
    <template #trigger="{ isOpen }">
      <Button block size="sm" :variant="active ? 'selected' : 'secondary'" :disabled="disabled" :aria-expanded="isOpen">
        <template v-if="selected" #icon>
          <svg class="trigger-preview" :viewBox="selected.viewBox" aria-hidden="true">
            <path
              :d="selected.path"
              :fill="selected.closed ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="4"
              stroke-linejoin="round"
              :stroke-linecap="selected.closed ? 'round' : 'butt'"
            />
            <path :d="selected.markers.filled" fill="currentColor" />
            <path :d="selected.markers.outlined" fill="none" stroke="currentColor" stroke-width="4" />
          </svg>
        </template>
        <span class="trigger-label">
          <span>{{ props.modelValue ? t(`arrowPreset_${props.modelValue}`) : t('arrow') }}</span>
          <ChevronDown :size="14" aria-hidden="true" />
        </span>
      </Button>
    </template>
    <template #default="{ close }">
      <div class="arrow-picker" @keydown.stop="$event.key === 'Escape' && close()">
        <div class="header">
          <strong>{{ t('arrowLibrary') }}</strong
          ><span>{{ t('arrowCount', { count: options.length }) }}</span>
        </div>
        <Input v-model="query" size="sm" autofocus :placeholder="t('searchArrows')" :aria-label="t('searchArrows')">
          <template #prefix><Search :size="14" /></template>
        </Input>
        <ScrollShadow class="arrow-scroll" size="18px" hide-scrollbar>
          <div v-if="visible.length" class="arrow-grid" role="listbox" :aria-label="t('arrowLibrary')">
            <Button
              v-for="option in visible"
              :key="option.id"
              size="sm"
              icon-only
              :variant="modelValue === option.id ? 'selected' : 'ghost'"
              role="option"
              :aria-label="t(`arrowPreset_${option.id}`)"
              :tooltip="t(`arrowPreset_${option.id}`)"
              :aria-selected="modelValue === option.id"
              @click="choose(option.id, close)"
            >
              <template #icon>
                <svg :viewBox="option.viewBox" aria-hidden="true" class="preview">
                  <path
                    :d="option.path"
                    :fill="option.closed ? 'currentColor' : 'none'"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linejoin="round"
                    :stroke-linecap="option.closed ? 'round' : 'butt'"
                  />
                  <path :d="option.markers.filled" fill="currentColor" />
                  <path
                    :d="option.markers.outlined"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linejoin="round"
                  />
                </svg>
              </template>
            </Button>
          </div>
          <p v-else class="empty">{{ t('noArrowResults') }}</p>
        </ScrollShadow>
        <div v-if="allowDrawing" class="drawing-actions">
          <Button
            block
            size="sm"
            variant="secondary"
            :icon="PenTool"
            @click="
              emit('draw');
              close();
            "
            >{{ t('drawArrow') }}</Button
          >
        </div>
      </div>
    </template>
  </Popover>
</template>
<style scoped>
.arrow-picker {
  width: min(304px, calc(100vw - 24px));
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 2px;
  gap: 12px;
}
.header strong {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}
.header span {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
.arrow-scroll {
  height: min(300px, 45vh);
}
.arrow-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 2px;
}
.arrow-grid > button {
  width: 100%;
  height: 48px;
}
.preview {
  display: block;
  width: 44px;
  height: 34px;
}
.trigger-preview {
  display: block;
  width: 20px;
  height: 20px;
  overflow: visible;
}
.trigger-label {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  gap: 8px;
  line-height: 1;
}
.trigger-label svg {
  display: block;
  flex-shrink: 0;
}
.trigger-label > span {
  display: block;
  text-box: trim-both cap alphabetic;
}
.drawing-actions {
  display: grid;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}
.empty {
  margin: 0;
  padding: 28px 12px;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
</style>
