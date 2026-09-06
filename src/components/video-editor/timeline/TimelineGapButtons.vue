<script setup lang="ts">
import { computed } from 'vue';
import { Trash2 } from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import { timelineGaps, removeTimelineGap } from '../composition/timeline-gaps';
import type { TimelineGap } from '../composition/timeline-lock-types';
import { timelineSpanStyle } from './timeline-clip-geometry';
const props = defineProps<{
  clips: Clip[];
  composition: ClipComposition;
  durationMs: number;
  widthPx: number;
  moving: boolean;
}>();
const emit = defineEmits<{ remove: [gap: TimelineGap] }>();
const { t } = useTranslate('TimelineTracks');
const gaps = computed(() =>
  timelineGaps(props.clips).filter((gap) => removeTimelineGap(props.composition, gap) !== props.composition),
);
</script>
<template>
  <template v-if="!moving">
    <div
      v-for="gap in gaps"
      :key="gap.startMs"
      class="timeline-gap"
      :style="timelineSpanStyle(gap.startMs, gap.endMs - gap.startMs, durationMs / 1000, widthPx)"
    >
      <div class="gap-action" @pointerdown.stop @click.stop>
        <Button
          v-if="((gap.endMs - gap.startMs) / durationMs) * widthPx >= 24"
          variant="ghost"
          size="xs"
          icon-only
          :style="{ color: 'inherit' }"
          :icon="Trash2"
          :title="t('removeGap')"
          :aria-label="t('removeGap')"
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
  overflow: hidden;
  pointer-events: auto;
  z-index: 9;
}
.gap-action {
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
.gap-action:hover {
  color: var(--color-error);
}
</style>
