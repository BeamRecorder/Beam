<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import HUD from '../../../apps/desktop/src/components/hud/HUD.vue';
import RecorderBar from '../../../apps/desktop/src/components/hud/recorder/RecorderBar.vue';
import QuickSnipStatus from '../../../apps/desktop/src/components/quick-snip/QuickSnipStatus.vue';
import HeroArtwork from './HeroArtwork.vue';
import HeroCursor from './HeroCursor.vue';
import HeroChat from './HeroChat.vue';
import HeroDock from './HeroDock.vue';
import wallpaper from '../../../public/wallpapers/image/sequoia-blue.webp';
import { heroState } from './hero-motion';
import { smooth } from './motion';
import { setPreset, publishExport } from './demo-capture';
import { mascotClock } from './mascot-clock';
import type { Pose } from './demo-types';

const props = defineProps<{ pose: Pose }>();
const state = computed(() => heroState(props.pose.time));
const artworkTime = computed(() => state.value.chatTime >= 16.85
  ? (state.value.chatTime - 16.85) % 2.6 : state.value.artworkTime);
const artworkStyle = computed(() => {
  const s = state.value;
  const top = Math.max(0, (s.chatY + 47 * s.chatScale - s.mediaY) / s.mediaScale);
  const bottom = Math.max(0, (s.mediaY + 400 * s.mediaScale - s.chatY - 322 * s.chatScale) / s.mediaScale);
  return {
    // The native surface is captured at 2×. Land the moving preview on that
    // pixel grid so its clipped top edge does not rerasterize after a seek.
    transform: `translate3d(${Math.round(s.mediaX * 2) / 2}px,${Math.round(s.mediaY * 2) / 2}px,0) scale(${s.mediaScale})`,
    opacity: s.artworkOpacity,
    zIndex: s.time >= 12.6 ? 3 : 0,
    clipPath: s.attachment === 1 && (top > 0 || bottom > 0)
      ? `inset(${top}px 0 ${bottom}px 0)` : undefined,
  };
});
const open = ref(false);
let resolveArtwork: () => void;
const artworkReady = new Promise<void>((resolve) => { resolveArtwork = resolve; });
let thumbnail = '';
let finalThumbnail = '';
async function synchronize() {
  setPreset(state.value.preset);
  await nextTick();
  // The native Window tile intentionally crops its title-bar decoration.
  document.querySelector('.hero-hud .window-dots')?.setAttribute('data-layout-allow-overflow', '');
  if (open.value !== state.value.menuOpen) {
    document.querySelector<HTMLButtonElement>('.hero-hud .preset-control button.select-trigger')?.click();
    await nextTick();
    // Vue clears its native enter classes over two frames. Position the
    // preview against the settled anchor, including a direct reverse seek.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  if (state.value.menuOpen) {
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    const previewVisible = state.value.previewPreset > 0;
    options.forEach(option => option.dispatchEvent(new PointerEvent('pointerleave')));
    if (previewVisible) options[state.value.previewPreset]?.dispatchEvent(new PointerEvent('pointerenter'));
    await nextTick();
    for (let attempt = 0; previewVisible && attempt < 20; attempt++) {
      const canvas = document.querySelector<HTMLElement>('.preset-preview-media canvas');
      if (canvas && canvas.style.display !== 'none') break;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    const menu = document.querySelector<HTMLElement>('.popover-content');
    if (menu) menu.style.opacity = String(smooth((state.value.time - state.value.menuStart) / 0.16));
    const preview = document.querySelector<HTMLElement>('.tooltip-content');
    if (preview) preview.style.opacity = String(smooth((state.value.time - state.value.previewStart) / 0.15));
  }
  if (state.value.stopped && state.value.time < 12.6 && !finalThumbnail) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    finalThumbnail = document.querySelector<HTMLCanvasElement>('.hero-artwork canvas')!.toDataURL('image/webp', 0.75);
  }
  mascotClock.value = state.value.mascotTime;
  publishExport(state.value.progress * 4.5, state.value.stopped ? finalThumbnail || thumbnail : thumbnail, state.value.completed, state.value.progress, state.value.copied);
  await nextTick();
}
const ready = (async () => {
  await artworkReady;
  await nextTick();
  thumbnail = document.querySelector<HTMLCanvasElement>('.hero-artwork canvas')!.toDataURL('image/webp', 0.75);
  await synchronize();
})();
defineExpose({ ready, synchronize });
</script>
<template>
  <div class="hero-world" :data-phase="state.completed ? 'completed' : state.stopped ? 'processing' : state.recording ? 'recording' : 'preset'">
    <img class="hero-backdrop" :src="wallpaper" alt="" />
    <div class="hero-artwork" :style="artworkStyle" data-layout-allow-overflow><HeroArtwork :time="artworkTime" :preset="state.preset" :selected="state.recording" @ready="resolveArtwork()" /></div>
    <div class="hero-chat-window" :style="{ opacity: state.chatOpacity, transform: `translate3d(${state.chatX}px,${state.chatY}px,0) scale(${state.chatScale})` }" data-layout-allow-overflow><HeroChat :state="state" /></div>
    <div class="hero-hud" :style="{ opacity: state.hudOpacity, transform: `translate3d(${state.hudX}px,${state.hudY}px,0) scale(${state.hudScale})` }" data-layout-allow-overflow>
      <HUD embedded show-topbar :embedded-capture-mode="state.captureMode" @popover-toggle="open = $event" />
    </div>
    <div class="hero-recorder" :style="{ opacity: state.recorderOpacity }">
      <RecorderBar phase="recording" :recording-time="`00:0${Math.floor(state.artworkTime)}`" visibility="always" />
    </div>
    <div class="hero-status" :style="{ opacity: state.statusOpacity }"><QuickSnipStatus /></div>
    <HeroDock :state="state" />
    <HeroCursor :time="pose.time" />
  </div>
</template>
<style scoped>
.hero-world { position: absolute; inset: 0; overflow: hidden; }
.hero-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hero-artwork { position: absolute; left: 0; top: 0; width: 640px; height: 400px; display: flex; transform-origin: 0 0; overflow: hidden; border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }
.hero-hud { position: absolute; left: 0; top: 0; width: 608px; transform-origin: 0 0; }
.hero-chat-window { position: absolute; left: 0; top: 0; width: 640px; height: 400px; border-radius: var(--radius-lg); overflow: hidden; transform-origin: 0 0; z-index: 2; box-shadow: var(--shadow-lg); }
.hero-recorder { position: absolute; left: 167px; top: 260px; width: 372px; height: 88px; transform: scale(.82); transform-origin: 0 0; }
.hero-status { position: absolute; left: 278px; top: 204px; width: 350px; height: 140px; contain: layout; }
</style>
