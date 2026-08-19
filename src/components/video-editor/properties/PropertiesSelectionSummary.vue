<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Badge from '~/components/ui/badge/Badge.vue';
import Tooltip from '~/components/ui/tooltip/Tooltip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { fitSelectionNameCount, tooltipSelectionItems } from './selection-summary';

const props = defineProps<{ names: string[] }>();
const { t } = useTranslate('PropertiesPanel');
const root = ref<HTMLElement | null>(null);
const separator = ref<HTMLElement | null>(null);
const badgeMeasure = ref<HTMLElement | null>(null);
const measuredNames = ref<HTMLElement[]>([]);
const visibleCount = ref(1);
let resizeObserver: ResizeObserver | null = null;

const selectedNames = computed(() => props.names.map((name) => name.trim()).filter(Boolean));
const visibleNames = computed(() => selectedNames.value.slice(0, visibleCount.value));
const hiddenCount = computed(() => Math.max(0, selectedNames.value.length - visibleCount.value));
const tooltipItems = computed(() => tooltipSelectionItems(selectedNames.value));
const setMeasuredName = (element: unknown, index: number) => {
  if (element instanceof HTMLElement) measuredNames.value[index] = element;
};
const measure = () => {
  const availableWidth = root.value?.clientWidth ?? 0;
  const widths = selectedNames.value.map((_, index) => measuredNames.value[index]?.offsetWidth ?? 0);
  visibleCount.value = fitSelectionNameCount(
    widths,
    availableWidth,
    separator.value?.offsetWidth ?? 8,
    badgeMeasure.value?.offsetWidth ?? 30,
  );
};
const scheduleMeasure = () => void nextTick(measure);

watch(selectedNames, scheduleMeasure, { immediate: true });
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(root.value);
  }
  window.addEventListener('resize', scheduleMeasure);
  scheduleMeasure();
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', scheduleMeasure);
});
</script>

<template>
  <div v-if="selectedNames.length" ref="root" class="selection-summary" :aria-label="selectedNames.join(', ')">
    <span class="selection-names">{{ visibleNames.join(', ') }}</span>
    <Tooltip v-if="hiddenCount" position="bottom" :max-width="320" interactive>
      <Badge class="selection-count" variant="outline" tabindex="0">+{{ hiddenCount }}</Badge>
      <template #content>
        <div class="selection-tooltip-list">
          <div v-for="(name, index) in tooltipItems.visible" :key="`${name}:${index}`">{{ name }}</div>
          <div v-if="tooltipItems.remaining">{{ t('selectionAndMore', { count: tooltipItems.remaining }) }}</div>
        </div>
      </template>
    </Tooltip>
    <div class="selection-measurement" aria-hidden="true">
      <span
        v-for="(name, index) in selectedNames"
        :key="`${name}:${index}`"
        :ref="(element) => setMeasuredName(element, index)"
        >{{ name }}</span
      >
      <span ref="separator">, </span>
      <span ref="badgeMeasure" class="selection-count">+{{ selectedNames.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.selection-summary {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 16px;
}
.selection-names {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-count {
  flex-shrink: 0;
  padding: 2px 6px;
  font-size: 10px;
  letter-spacing: 0;
  text-transform: none;
}
.selection-measurement {
  position: absolute;
  width: max-content;
  visibility: hidden;
  pointer-events: none;
}
.selection-tooltip-list {
  display: grid;
  max-height: min(360px, calc(100vh - 24px));
  gap: 8px;
  overflow: auto;
  white-space: normal;
}
</style>
