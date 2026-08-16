<script setup lang="ts">
import type { WebsitePlatform } from '@website/lib/platform-downloads';

defineProps<{ platform: WebsitePlatform }>();
</script>

<template>
  <img v-if="platform === 'linux'" class="platform-icon platform-icon--linux" src="/os/linux.svg" alt="" />
  <span v-else class="platform-icon" :class="`platform-icon--${platform}`" aria-hidden="true" />
</template>

<style scoped>
.platform-icon {
  display: inline-block;
  flex: 0 0 auto;
  width: 1em;
  height: 1em;
  background: currentColor;
  -webkit-mask-position: center;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}

.platform-icon--windows {
  color: #4aa5e8;
  -webkit-mask-image: url('/os/windows.svg');
  mask-image: url('/os/windows.svg');
}

.platform-icon--macos {
  color: var(--text-primary);
  -webkit-mask-image: url('/os/apple.svg');
  mask-image: url('/os/apple.svg');
}

.platform-icon--linux {
  display: inline-block;
  background: transparent;
  object-fit: contain;
  transform: scale(1.14);
}
</style>
