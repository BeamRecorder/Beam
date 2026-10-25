<script setup lang="ts">
import { computed } from 'vue';
import { Trash2, Lock } from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { Clip, ClipComposition } from '@beam/engine/shared/composition-types';
import { timelineGaps, planTimelineGapRemoval } from '@beam/engine/composition/timeline-gaps';
import type { TimelineGap } from '@beam/engine/composition/timeline-lock-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { timelineSpanStyle, formatTimelineTrimTime } from './timeline-clip-geometry';
import { useTimelineVirtualWindow } from './composables/useTimelineVirtualization';
import { createTimelineRangeIndex } from './composables/timeline-range-index';
const props = defineProps<{
  clips: Clip[];
  composition: ClipComposition;
  zoomElements?: readonly ZoomElement[];
  durationMs: number;
  widthPx: number;
  moving: boolean;
}>();
const emit = defineEmits<{ remove: [gap: TimelineGap] }>();
const { t } = useTranslate('TimelineTracks');
const window = useTimelineVirtualWindow();
const gapsAt = computed(() =>
  createTimelineRangeIndex(timelineGaps(props.clips), (gap) => ({
    start: gap.startMs,
    end: gap.endMs,
  })),
);
const gaps = computed(() =>
  gapsAt.value(window?.timeRange.value.start ?? 0, window?.timeRange.value.end ?? props.durationMs).flatMap((gap) => {
    const plan = planTimelineGapRemoval(props.composition, gap, props.zoomElements);
    if (plan.kind === 'invalid' || plan.kind === 'overlap') return [];
    const names =
      plan.kind === 'locked'
        ? [
            ...props.composition.clips
              .filter((clip) => plan.blockers.clipIds.includes(clip.id))
              .map((clip) => `${clip.name} (${formatTimelineTrimTime(clip.timelineStartMs)})`),
            ...(props.zoomElements ?? [])
              .filter((zoom) => plan.blockers.zoomIds.includes(zoom.id))
              .map((zoom) => `${t('zoomTitle', { level: zoom.depth })} (${formatTimelineTrimTime(zoom.startMs)})`),
          ]
        : [];
    return [
      {
        gap,
        locked: plan.kind === 'locked',
        label: names.length ? t('lockedMessage', { name: names.join(', ') }) : t('removeGap'),
      },
    ];
  }),
);
</script>
<template>
  <template v-if="!moving">
    <div
      v-for="{ gap, locked, label } in gaps"
      :key="gap.startMs"
      class="timeline-gap"
      :style="timelineSpanStyle(gap.startMs, gap.endMs - gap.startMs, durationMs / 1000, widthPx)"
    >
      <div class="gap-action" :class="{ locked }" @pointerdown.stop @click.stop>
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :style="{ color: 'inherit' }"
          :icon="locked ? Lock : Trash2"
          :disabled="locked"
          :tooltip="label"
          :aria-label="label"
          @click.stop="emit('remove', gap)"
        />
      </div>
    </div>
  </template>
</template>
<style scoped>
.timeline-gap {
  position: absolute;
  top: 2px;
  bottom: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  pointer-events: auto;
  z-index: 9;
}
.gap-action {
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 100ms ease;
  color: var(--text-secondary);
}
.timeline-gap:hover .gap-action,
.timeline-gap:focus-within .gap-action {
  opacity: 1;
  pointer-events: auto;
}
.gap-action:not(.locked):hover {
  color: var(--color-error);
}
</style>
