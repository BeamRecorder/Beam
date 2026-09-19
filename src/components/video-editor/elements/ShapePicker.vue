<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, Search } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import Popover from '~/ui/popover/Popover.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { createFuzzySearchEngine } from '~/ui/select/fuzzy-search';
import { SHAPE_CATALOG, shapeDefinition, shapeDisplayName, type ShapeKind } from '~/media/shared/shape-catalog';
import { useTranslate } from '~/i18n/useTranslate';

const props = withDefaults(
  defineProps<{
    modelValue: ShapeKind;
    disabled?: boolean;
    compact?: boolean;
    direction?: 'up' | 'down';
  }>(),
  {
    disabled: false,
    compact: false,
    direction: 'down',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: ShapeKind];
  select: [value: ShapeKind];
}>();

const { t, locale } = useTranslate('Elements');
const query = ref('');
const selected = computed(() => shapeDefinition(props.modelValue));
const displayName = (value: ShapeKind) => shapeDisplayName(value, String(locale?.value ?? 'en'));
const selectedName = computed(() => displayName(props.modelValue));
const search = createFuzzySearchEngine(SHAPE_CATALOG, (definition) => [
  definition.name,
  shapeDisplayName(definition.id, 'fr'),
  definition.id,
  ...definition.keywords,
]);
const visibleShapes = computed(() => search.search(query.value));

const choose = (value: ShapeKind, close: () => void) => {
  emit('update:modelValue', value);
  emit('select', value);
  close();
};

const handleToggle = (open: boolean) => {
  if (!open) query.value = '';
};

const handleKeydown = (event: KeyboardEvent, close: () => void) => {
  event.stopPropagation();
  if (event.key === 'Escape') close();
};
</script>

<template>
  <Popover block :direction="direction" :disabled="disabled" :match-trigger-width="false" @toggle="handleToggle">
    <template #trigger="{ isOpen }">
      <Button
        block
        size="sm"
        :variant="isOpen ? 'primary' : 'secondary'"
        :disabled="disabled"
        :icon-only="compact"
        :aria-label="`${t('shape')}: ${selectedName}`"
        :aria-expanded="isOpen"
      >
        <template #icon>
          <svg class="shape-trigger-preview" :viewBox="selected.viewBox" aria-hidden="true">
            <path :d="selected.path" :fill-rule="selected.fillRule" />
          </svg>
        </template>
        <template v-if="!compact">{{ selectedName }}<ChevronDown class="shape-chevron" :size="14" /></template>
      </Button>
    </template>

    <template #default="{ close }">
      <div class="shape-picker" @keydown="handleKeydown($event, close)">
        <div class="shape-picker-header">
          <div>
            <strong>{{ t('shapeLibrary') }}</strong>
            <span>{{ t('shapeCount', { count: SHAPE_CATALOG.length }) }}</span>
          </div>
          <Input v-model="query" size="sm" autofocus :placeholder="t('searchShapes')" :aria-label="t('searchShapes')">
            <template #prefix><Search :size="14" /></template>
          </Input>
        </div>

        <ScrollShadow class="shape-scroll" size="18px" hide-scrollbar>
          <div v-if="visibleShapes.length" class="shape-grid" role="listbox" :aria-label="t('shapeLibrary')">
            <div v-for="definition in visibleShapes" :key="definition.id" class="shape-option-shell">
              <Button
                size="sm"
                icon-only
                :variant="definition.id === modelValue ? 'primary' : 'ghost'"
                :tooltip="displayName(definition.id)"
                :aria-label="displayName(definition.id)"
                :aria-selected="definition.id === modelValue"
                role="option"
                @click="choose(definition.id, close)"
              >
                <template #icon>
                  <svg
                    class="shape-option-preview"
                    :viewBox="definition.viewBox"
                    preserveAspectRatio="xMidYMid meet"
                    aria-hidden="true"
                  >
                    <path :d="definition.path" :fill-rule="definition.fillRule" />
                  </svg>
                </template>
              </Button>
            </div>
          </div>
          <p v-else class="shape-empty">{{ t('noShapeResults') }}</p>
        </ScrollShadow>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.shape-picker {
  width: min(304px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
}

.shape-picker-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shape-picker-header > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 0;
}

.shape-picker-header strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
}

.shape-picker-header span {
  color: var(--text-muted);
  font-size: 10px;
}

.shape-scroll {
  height: min(326px, 52vh);
}

.shape-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  padding: 2px;
}

.shape-option-shell {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
}

.shape-trigger-preview {
  width: 18px;
  height: 18px;
  overflow: visible;
  fill: currentColor;
}

.shape-option-preview {
  width: 26px;
  height: 26px;
  overflow: visible;
  fill: currentColor;
}

.shape-chevron {
  flex: none;
  margin-left: 6px;
  vertical-align: middle;
}

.shape-empty {
  margin: auto;
  padding: 28px 12px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
</style>
