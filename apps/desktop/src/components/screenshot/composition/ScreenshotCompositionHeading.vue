<script setup lang="ts">
import { ChevronDown, Layers } from '@lucide/vue';
import Badge from '~/ui/badge/Badge.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ count: number; collapsed: boolean; upward?: boolean; compact?: boolean }>();
const { t } = useTranslate('ScreenshotComposition');
</script>

<template>
  <span class="composition-heading" :class="{ compact }">
    <Layers :size="16" aria-hidden="true" />
    <strong>{{ t('title') }}</strong>
    <Badge class="layer-count" variant="outline">{{ count }}</Badge>
    <ChevronDown
      :size="16"
      class="composition-chevron"
      :class="{ 'points-up': collapsed === Boolean(upward) }"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.composition-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.composition-heading > svg {
  flex-shrink: 0;
}
.composition-heading strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
}
.layer-count {
  flex-shrink: 0;
  color: var(--text-primary);
  background: var(--color-bg-element);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  padding: 4px 7px;
}
.composition-chevron {
  transition: transform 160ms ease;
}
.composition-chevron.points-up {
  transform: rotate(180deg);
}
.compact {
  gap: 6px;
}
.compact strong {
  font-size: 12px;
}
.compact .layer-count {
  font-size: 10px;
  padding: 1px 3px;
}
@media (prefers-reduced-motion: reduce) {
  .composition-chevron {
    transition: none;
  }
}
</style>
