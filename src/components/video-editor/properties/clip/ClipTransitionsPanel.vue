<script setup lang="ts">
import TransitionSettingsPanel from './TransitionSettingsPanel.vue';
import type { Clip, ClipTransition } from '~/media/shared/composition-types';

const props = defineProps<{ clip: Clip; initialEdge?: 'entry' | 'exit' }>();
const emit = defineEmits<{
  (event: 'update', edge: 'entry' | 'exit', value: ClipTransition | null): void;
}>();
</script>

<template>
  <TransitionSettingsPanel
    :transitions="clip.transitions ?? { entry: null, exit: null }"
    :timeline-duration-ms="clip.timelineDurationMs"
    :domain="clip.kind === 'audio' ? 'audio' : 'visual'"
    :initial-edge="initialEdge"
    @update="(edge, value) => emit('update', edge, value)"
  />
</template>
