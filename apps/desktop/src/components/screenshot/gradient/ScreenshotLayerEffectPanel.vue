<script setup lang="ts">
import ScreenshotGradientPanel from './ScreenshotGradientPanel.vue';
import ScreenshotColorPanel from './ScreenshotColorPanel.vue';
import type { LayerEffect } from '@beam/engine/gradient/gradient-types';
import type { LayerEffectPanelProps } from './gradient-panel-types';
defineProps<LayerEffectPanelProps>();
const emit = defineEmits<{ update: [patch: Partial<LayerEffect>]; remove: []; back: [] }>();
</script>
<template>
  <ScreenshotGradientPanel
    v-if="effect.kind === 'gradient'"
    :effect="effect"
    :disabled="disabled"
    @update="emit('update', $event)"
    @remove="emit('remove')"
    @back="emit('back')"
  />
  <ScreenshotColorPanel
    v-else
    :effect="effect"
    :disabled="disabled"
    @update="emit('update', $event)"
    @remove="emit('remove')"
    @back="emit('back')"
  />
</template>
