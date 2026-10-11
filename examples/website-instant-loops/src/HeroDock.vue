<script setup lang="ts">
import { MessageCircle } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import beam from '../../../public/brand/BeamIcon.webp';
import { heroPointer } from './hero-motion';
import type { HeroState } from './hero-types';
const props = defineProps<{ state: HeroState }>();
const scale = (x: number) => 1 + 0.14 * Math.max(0, 1 - Math.hypot(heroPointer(props.state.time).x - x, heroPointer(props.state.time).y - 370) / 48);
</script>
<template>
  <nav class="hero-dock" aria-label="Illustrative desktop dock">
    <div class="dock-item" :style="{ transform: `scale(${scale(286)})` }">
      <Button variant="ghost" size="md" icon-only aria-label="Open Beam"><template #icon><img :src="beam" alt="" /></template></Button>
      <i :style="{ opacity: state.dockActive === 'beam' ? 1 : 0 }" />
    </div>
    <span class="dock-separator" />
    <div class="dock-item" :style="{ transform: `scale(${scale(354)})` }">
      <Button variant="ghost" size="md" icon-only aria-label="Open illustrative chat"><template #icon><span class="chat-app-icon"><MessageCircle :size="23" :stroke-width="0" fill="currentColor" /></span></template></Button>
      <i :style="{ opacity: state.dockActive === 'chat' ? 1 : 0 }" />
    </div>
  </nav>
</template>
<style scoped>
.hero-dock { position: absolute; left: 254px; bottom: 6px; width: 132px; height: 48px; z-index: 10;  border-radius: var(--radius-lg); background: var(--color-bg-popover-surface);  box-shadow: var(--shadow-lg), inset 0 0 0 1px var(--color-border-strong); }
.dock-item { position: absolute; top: 4px; width: 40px; height: 40px; display: grid; place-items: center; transform-origin: center bottom; }
.dock-item:first-child { left: 12px; }
.dock-item:last-child { left: 80px; }
img { display: block; width: 32px; height: 32px; border-radius: 8px; }
.chat-app-icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; color: var(--text-on-primary); background: var(--color-success); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--text-on-primary) 25%, transparent); }
.dock-item i { position: absolute; left: 18px; bottom: -2px; width: 4px; height: 4px; border-radius: var(--radius-full); background: var(--text-primary); }
.dock-separator { position: absolute; top: 11px; left: 65px; width: 1px; height: 26px; background: var(--color-border-strong); }
</style>
