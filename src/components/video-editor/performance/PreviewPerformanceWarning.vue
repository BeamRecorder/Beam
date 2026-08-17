<script setup lang="ts">
import { computed } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { PreviewQuality } from '~/media/playback';
import type { PreviewPerformanceSnapshot } from './preview-performance-types';

const props = defineProps<{ snapshot: PreviewPerformanceSnapshot }>();
const emit = defineEmits<{ (event: 'select-quality', quality: PreviewQuality): void }>();
const { t } = useTranslate('PreviewPerformance');
const visible = computed(() => props.snapshot.status === 'warning' || props.snapshot.status === 'critical');
const qualityLabel = computed(() => (props.snapshot.recommendation === 'half' ? '1/2' : '1/4'));
</script>

<template>
  <Transition name="performance-warning">
    <div v-if="visible" class="performance-warning" role="status" aria-live="polite">
      <TriangleAlert aria-hidden="true" />
      <span>{{ t(snapshot.status === 'critical' ? 'criticalWarning' : 'warning') }}</span>
      <Button
        v-if="snapshot.recommendation"
        variant="outline"
        size="xs"
        @click="emit('select-quality', snapshot.recommendation)"
      >
        {{ t('reduceQuality', { quality: qualityLabel }) }}
      </Button>
    </div>
  </Transition>
</template>

<style scoped>
.performance-warning {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: min(520px, calc(100% - 24px));
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-element) 92%, transparent);
  box-shadow: var(--shadow-md);
  color: var(--text-primary);
  font-size: 11px;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.performance-warning > svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--color-warning);
}

.performance-warning-enter-active,
.performance-warning-leave-active {
  transition: opacity var(--fast) ease;
}

.performance-warning-enter-from,
.performance-warning-leave-to {
  opacity: 0;
}
</style>
