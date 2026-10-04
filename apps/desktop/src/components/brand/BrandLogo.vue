<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import BrandSymbol from './BrandSymbol.vue';
import { useBrandJingle } from './useBrandJingle';
import type { BrandSymbol as BrandSymbolName } from './brand-types';

withDefaults(
  defineProps<{
    title?: string;
    layout?: 'inline' | 'stacked';
    symbol?: BrandSymbolName;
  }>(),
  {
    layout: 'inline',
    symbol: 'beam',
  },
);
const { playing, letters, play } = useBrandJingle();
</script>

<template>
  <span
    class="brand-identity"
    :class="{
      'is-stacked': layout === 'stacked',
      'is-panel': symbol !== 'beam',
    }"
  >
    <BrandSymbol :symbol="symbol" :size="layout === 'stacked' ? 112 : symbol === 'beam' ? 24 : 16" />
    <Button
      v-if="!title || title === 'Beam'"
      variant="ghost"
      size="xs"
      wrap
      aria-label="Beam"
      title="Beam"
      class="brand-wordmark-control"
      :style="{
        height: '34px',
        minHeight: '0',
        padding: '0',
        color: 'inherit',
        background: 'transparent',
        WebkitAppRegion: 'no-drag',
      }"
      @click="play"
    >
      <span class="topbar-title" aria-hidden="true">
        <span class="brand-wordmark" :style="{ visibility: playing ? 'hidden' : 'visible' }">Beam</span>
        <span v-if="playing" class="brand-effects">
          <span v-for="(letter, index) in letters" :key="index" class="brand-letter">
            <span class="brand-letter-measure">{{ 'Beam'[index] }}</span>
            <span
              class="brand-letter-effect"
              :style="{
                opacity: letter.opacity,
                filter: `blur(${letter.blur}px) contrast(${letter.contrast})`,
                textShadow: `${letter.shadowX}px 0 var(--color-primary)`,
                clipPath: letter.reveal === 1 ? 'none' : `inset(-0.2em ${(1 - letter.reveal) * 100}% -0.2em -0.1em)`,
              }"
              >{{ letter.text }}</span
            >
          </span>
        </span>
      </span>
    </Button>
    <span v-else class="topbar-title">{{ title }}</span>
  </span>
</template>

<style scoped>
.brand-identity {
  display: flex;
  align-items: center;
  height: 32px;
  gap: 8px;
  white-space: nowrap;
}
.topbar-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  font: var(--weight-display) var(--font-size-xl) / 1.2 var(--font-sans);
  color: var(--text-primary);
}
.is-panel .topbar-title {
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
}
.brand-effects {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
}
.brand-letter {
  position: relative;
  flex: auto;
  text-align: center;
  font-variant-ligatures: none;
}
.brand-letter-measure {
  visibility: hidden;
}
.brand-letter-effect {
  position: absolute;
  inset: 0;
}
.brand-identity.is-stacked {
  flex-direction: column;
  height: auto;
  gap: 8px;
  padding: 8px 24px;
}
.is-stacked .topbar-title {
  font-size: 32px;
}
</style>
