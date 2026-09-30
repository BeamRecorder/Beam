<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import Beamy from './Beamy/Beamy.vue';
import { useBrandJingle } from './useBrandJingle';
import { useTranslate } from '~/i18n/useTranslate';
import type { BeamyPhase } from './Beamy/beamy-types';

withDefaults(defineProps<{ title?: string; phase?: BeamyPhase; layout?: 'inline' | 'stacked' }>(), {
  phase: 'idle',
  layout: 'inline',
});
const { t } = useTranslate('Brand');
const { playing, letters, cycleOffset, play } = useBrandJingle();
</script>

<template>
  <Button
    variant="ghost"
    size="xs"
    wrap
    :aria-label="t('animateBeamy')"
    :title="t('animateBeamy')"
    :style="{
      height: layout === 'stacked' ? 'auto' : '34px',
      minHeight: '0',
      padding: '0',
      color: 'inherit',
      background: 'transparent',
      WebkitAppRegion: 'no-drag',
    }"
    @click="play"
  >
    <span class="brand-identity" :class="{ 'is-stacked': layout === 'stacked' }">
      <span class="brand-avatar" data-beamy-dock
        ><Beamy
          portrait
          :size="layout === 'stacked' ? 112 : 32"
          :cycle-offset="cycleOffset"
          :phase="phase === 'idle' && playing ? 'processing' : phase"
      /></span>
      <span class="topbar-title" aria-hidden="true">
        <template v-if="!title || title === 'Beam'">
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
        </template>
        <template v-else>{{ title }}</template>
      </span>
    </span>
  </Button>
</template>

<style scoped>
.brand-identity {
  display: flex;
  align-items: center;
  height: 32px;
  gap: 3px;
  white-space: nowrap;
}
.brand-avatar {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: none;
}
.topbar-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  font: var(--weight-display) var(--font-size-xl) / 1.2 var(--font-sans);
  color: var(--text-primary);
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
.is-stacked .brand-avatar {
  width: 112px;
  height: 112px;
}
.is-stacked .topbar-title {
  font-size: 32px;
}
</style>
