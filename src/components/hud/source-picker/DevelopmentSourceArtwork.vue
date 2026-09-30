<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Check, ChevronRight, Play, Search } from '@lucide/vue';
import type { SourcePickerSource } from '~/api/types/source-picker';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { developmentSourceIcon } from './development-source-icons';

const props = defineProps<{ source: SourcePickerSource; live?: boolean }>();
const clock = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  () => props.live,
  (live) => {
    clearInterval(timer);
    if (live)
      timer = setInterval(() => {
        clock.value = new Date();
      }, 1000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(timer));
const time = computed(() =>
  clock.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
);
const wallpaper = computed(() => resolvePublicAssetUrl(`/wallpapers/image/${props.source.wallpaper}`));
const lines = [
  'const capture = useCapture();',
  '',
  'async function startRecording() {',
  '  const source = await selectWindow();',
  '  await capture.prepare(source);',
  '  return capture.start();',
  '}',
  '',
  'export default CaptureStudio;',
];
</script>

<template>
  <div class="artwork" :class="source.artwork">
    <template v-if="source.artwork === 'desktop'">
      <img class="wallpaper" :src="wallpaper" alt="" draggable="false" />
      <span class="desktop-time">{{ live ? time : '09:41' }}</span>
      <div class="dock">
        <span v-for="icon in ['browser', 'code', 'design', 'chat', 'terminal'] as const" :key="icon"
          ><component :is="developmentSourceIcon(icon)"
        /></span>
      </div>
    </template>
    <template v-else>
      <div class="app-chrome">
        <span class="traffic-lights"><i /><i /><i /></span><span>{{ source.app }}</span
        ><span v-if="live" class="live-clock">{{ time }}</span>
      </div>
      <div class="scene">
        <aside v-if="source.artwork !== 'video'" class="scene-sidebar">
          <component :is="developmentSourceIcon(source.artwork)" :size="16" />
          <span v-for="row in 5" :key="row" class="sidebar-line" />
        </aside>
        <div v-if="source.artwork === 'code' || source.artwork === 'terminal'" class="code-content">
          <span class="code-tab">{{ source.artwork === 'code' ? 'App.vue' : 'beam — zsh' }}</span>
          <div v-for="(line, index) in lines" :key="index" class="code-line">
            <span>{{ index + 1 }}</span
            ><code>{{ line || ' ' }}</code>
          </div>
          <div v-if="live" class="terminal-status">✓ Preview active · {{ time }}<span class="caret" /></div>
        </div>
        <div v-else-if="source.artwork === 'browser'" class="browser-content">
          <div class="address"><Search :size="10" /><span>beam.app / studio</span></div>
          <div class="hero">
            <img :src="wallpaper" alt="" />
            <div>
              <span class="eyebrow">BEAM STUDIO</span><strong>Make every<br />demo shine.</strong
              ><span class="hero-cta">Start creating <ChevronRight :size="10" /></span>
            </div>
          </div>
          <div class="metric-row">
            <span v-for="value in ['12.8k', '98%', '4.9']" :key="value"
              ><b>{{ value }}</b
              ><i
            /></span>
          </div>
        </div>
        <div v-else-if="source.artwork === 'design'" class="design-content">
          <div class="design-board">
            <div class="design-title">Capture Studio</div>
            <div class="swatches"><i /><i /><i /></div>
            <div class="design-cards">
              <img :src="wallpaper" alt="" />
              <div><span /><span /><span /></div>
            </div>
          </div>
          <div class="design-inspector"><i v-for="row in 8" :key="row" /></div>
        </div>
        <div v-else-if="source.artwork === 'chat'" class="chat-content">
          <strong># product-team</strong>
          <div
            v-for="(message, index) in [
              'Ready for the next launch?',
              'Capture looks great on every screen.',
              'Let’s ship something beautiful.',
            ]"
            :key="message"
            class="message"
          >
            <span class="avatar">{{ ['A', 'M', 'J'][index] }}</span>
            <div>
              <b>{{ ['Alex', 'Morgan', 'Jamie'][index] }}</b>
              <p>{{ message }}</p>
            </div>
          </div>
          <div class="chat-input">{{ live ? `Last update ${time}` : 'Message the team…' }}</div>
        </div>
        <div v-else-if="source.artwork === 'video'" class="video-content">
          <div class="video-frame"><img :src="wallpaper" alt="" /><Play :size="26" /></div>
          <div class="video-timeline">
            <span v-for="track in 3" :key="track"><i /><i /><i /></span>
            <div class="playhead" :style="live ? { left: `${15 + clock.getSeconds()}%` } : undefined" />
          </div>
        </div>
        <div v-else class="document-content">
          <span class="eyebrow">BEAM / WORKSPACE</span><strong>{{ source.name }}</strong
          ><span class="paragraph-line" v-for="row in 3" :key="row" />
          <div
            v-for="item in ['Explore the idea', 'Design the experience', 'Share the story']"
            :key="item"
            class="checklist"
          >
            <Check :size="12" />{{ item }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped src="./development-artwork.css"></style>
