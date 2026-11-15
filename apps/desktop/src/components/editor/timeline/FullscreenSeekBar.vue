<script setup lang="ts">
import { computed } from 'vue';
import Slider from '~/ui/slider/Slider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { PlaybackSeekMode } from '@beam/runtime/playback/index';
import { formatPlaybackTime } from './playback-time';

const props = defineProps<{ currentTime: number; duration: number; loading?: boolean }>();
const emit = defineEmits<{ seek: [time: number, mode: PlaybackSeekMode] }>();
const { t } = useTranslate('TimelineToolbar');
const duration = computed(() => (Number.isFinite(props.duration) ? Math.max(0, props.duration) : 0));
const time = computed(() =>
  Number.isFinite(props.currentTime) ? Math.max(0, Math.min(props.currentTime, duration.value)) : 0,
);
const disabled = computed(() => props.loading || duration.value <= 0);
const seek = (value: number, mode: PlaybackSeekMode) => {
  if (disabled.value || !Number.isFinite(value)) return;
  emit('seek', Math.max(0, Math.min(value, duration.value)), mode);
};
</script>

<template>
  <Slider
    :model-value="time"
    :min="0"
    :max="duration"
    :step="0.01"
    :show-value="false"
    :label="t('seekPreview')"
    :value-text="`${formatPlaybackTime(time)} / ${formatPlaybackTime(duration)}`"
    :disabled="disabled"
    @update:model-value="seek($event, 'scrub')"
    @commit="seek($event, 'seek')"
  />
</template>
