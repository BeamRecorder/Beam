<script setup lang="ts">
import { computed } from 'vue';
import { Film } from '@lucide/vue';
import type { EditorLoadingProgress } from '~/api/types/editor-window';
import { useTranslate } from '~/i18n/useTranslate';
import ProgressBar from '~/ui/progressbar/ProgressBar.vue';

const props = defineProps<{
  progress: EditorLoadingProgress;
}>();

const { t } = useTranslate('EditorPreparingHud');
const percentage = computed(() => Math.round(Math.min(100, Math.max(0, props.progress.value))));
const stageLabel = computed(() => t(props.progress.stage));
</script>

<template>
  <section class="editor-preparing-hud" aria-live="polite" aria-busy="true">
    <div class="editor-preparing-icon" aria-hidden="true">
      <Film :size="28" :stroke-width="1.8" />
    </div>

    <div class="editor-preparing-copy">
      <h2>{{ t('title') }}</h2>
      <p>{{ stageLabel }}</p>
    </div>

    <div
      class="editor-progress"
      role="progressbar"
      :aria-label="t('progressLabel')"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percentage"
      :aria-valuetext="stageLabel"
    >
      <ProgressBar :value="percentage" :max="100" />
      <span>{{ percentage }}%</span>
    </div>
  </section>
</template>

<style scoped>
.editor-preparing-hud {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 32px 28px 40px;
  color: var(--text-primary);
  text-align: center;
}

.editor-preparing-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.editor-preparing-copy {
  display: grid;
  gap: 6px;
}

.editor-preparing-copy h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.25px;
}

.editor-preparing-copy p {
  min-height: 20px;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.editor-progress {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
