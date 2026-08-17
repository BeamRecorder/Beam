<script setup lang="ts">
import { computed } from 'vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import Button from '~/ui/button/Button.vue';
import BlurRevealTransition from '~/ui/transitions/BlurRevealTransition.vue';
import MiniPerformanceGraph from '~/ui/performance/MiniPerformanceGraph.vue';
import { Info } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { PreviewPerformanceSnapshot } from './preview-performance-types';

type PerformanceLevel = 'good' | 'high' | 'critical';
type Detail = { id: string; label: string; values: number[]; score: number; color: string };

const props = defineProps<{ snapshot: PreviewPerformanceSnapshot }>();
const { t } = useTranslate('PreviewPerformance');

const scoreLevel = (score: number): PerformanceLevel => {
  if (score >= 0.8) return 'critical';
  if (score >= 0.55) return 'high';
  return 'good';
};
const levelColor = (level: PerformanceLevel, fallback = 'var(--color-success)') => {
  if (level === 'critical') return 'var(--color-error)';
  if (level === 'high') return 'var(--color-warning)';
  return fallback;
};
const statusLabel = (score: number) => t(scoreLevel(score));
const playbackScore = computed(() => Math.max(props.snapshot.scores.worker, props.snapshot.scores.audio));
const overallScore = computed(() =>
  Math.max(
    props.snapshot.scores.ui,
    props.snapshot.activity.playback ? playbackScore.value : 0,
    props.snapshot.activity.media ? props.snapshot.scores.media : 0,
  ),
);
const overallLevel = computed(() => scoreLevel(overallScore.value));
const overallColor = computed(() => levelColor(overallLevel.value));
const overallValues = computed(() =>
  props.snapshot.samples.map((sample) => Math.max(sample.ui, sample.worker, sample.audio, sample.media)),
);
const uiDetail = computed<Detail>(() => ({
  id: 'ui',
  label: t('ui'),
  values: props.snapshot.samples.map((sample) => sample.ui),
  score: props.snapshot.scores.ui,
  color: levelColor(scoreLevel(props.snapshot.scores.ui)),
}));
const playbackDetail = computed<Detail>(() => ({
  id: 'playback',
  label: t('worker'),
  values: props.snapshot.samples.map((sample) => Math.max(sample.worker, sample.audio)),
  score: playbackScore.value,
  color: levelColor(scoreLevel(playbackScore.value)),
}));
const mediaDetail = computed<Detail>(() => ({
  id: 'media',
  label: t('media'),
  values: props.snapshot.samples.map((sample) => sample.media),
  score: props.snapshot.scores.media,
  color: levelColor(scoreLevel(props.snapshot.scores.media)),
}));
const visibleDetails = computed(() => [
  uiDetail.value,
  ...(props.snapshot.activity.playback ? [playbackDetail.value] : []),
  ...(props.snapshot.activity.media ? [mediaDetail.value] : []),
]);
const accessibleLabel = computed(
  () => `${t('title')}: ${visibleDetails.value.map((item) => `${item.label}, ${statusLabel(item.score)}`).join('; ')}`,
);
</script>

<template>
  <Tooltip :content="accessibleLabel" position="bottom" :delay="100" :max-width="300" interactive>
    <div class="performance-widget" :class="`is-${overallLevel}`">
      <MiniPerformanceGraph
        class="performance-overview-graph"
        :values="overallValues"
        :color="overallColor"
        :width="96"
        :height="28"
        :animation-ms="460"
        :label="accessibleLabel"
      />
    </div>
    <template #content>
      <div class="performance-details">
        <header>
          <strong>{{ t('title') }}</strong>
          <Button
            variant="ghost"
            size="xs"
            icon-only
            :icon="Info"
            :tooltip="t('higherIsWorse')"
            tooltip-position="left"
            :aria-label="t('higherIsWorse')"
          />
        </header>

        <div class="performance-detail-row">
          <span>{{ uiDetail.label }}</span>
          <MiniPerformanceGraph
            :values="uiDetail.values"
            :color="uiDetail.color"
            :width="96"
            :height="28"
            :animation-ms="460"
            :label="`${uiDetail.label}: ${statusLabel(uiDetail.score)}`"
          />
        </div>

        <BlurRevealTransition>
          <div v-if="snapshot.activity.playback" class="performance-detail-row">
            <span>{{ playbackDetail.label }}</span>
            <MiniPerformanceGraph
              :values="playbackDetail.values"
              :color="playbackDetail.color"
              :width="96"
              :height="28"
              :animation-ms="460"
              :label="`${playbackDetail.label}: ${statusLabel(playbackDetail.score)}`"
            />
          </div>
        </BlurRevealTransition>

        <BlurRevealTransition>
          <div v-if="snapshot.activity.media" class="performance-detail-row">
            <span>{{ mediaDetail.label }}</span>
            <MiniPerformanceGraph
              :values="mediaDetail.values"
              :color="mediaDetail.color"
              :width="96"
              :height="28"
              :animation-ms="460"
              :label="`${mediaDetail.label}: ${statusLabel(mediaDetail.score)}`"
            />
          </div>
        </BlurRevealTransition>
      </div>
    </template>
  </Tooltip>
</template>

<style scoped>
.performance-widget {
  position: relative;
  width: 96px;
  height: 28px;
  display: inline-flex;
  align-items: stretch;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  isolation: isolate;
}

.performance-overview-graph {
  position: relative;
  z-index: 1;
  margin: -1px;
}

.performance-details {
  width: min(150px, calc(100vw - 42px));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.performance-details header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 8px;
}

.performance-details strong {
  color: var(--text-primary);
  font-size: 11px;
}

.performance-detail-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 96px);
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 10px;
  margin-top: 8px;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}

.performance-detail-row:first-of-type {
  margin-top: 0;
}

.performance-detail-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
