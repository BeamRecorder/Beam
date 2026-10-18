<script setup lang="ts">
import { Camera, CameraOff } from '@lucide/vue';
withDefaults(defineProps<{ enabled: boolean; size?: number }>(), { size: 14 });
</script>
<template>
  <component :is="enabled ? Camera : CameraOff" class="camera-icon" :class="{ 'is-off': !enabled }" :size="size" />
</template>
<style scoped>
.camera-icon.is-off {
  color: var(--color-error);
}
</style>
