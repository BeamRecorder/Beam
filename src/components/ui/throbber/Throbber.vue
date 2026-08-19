<script setup lang="ts">
import { computed } from 'vue';
import { useReducedMotion } from '@vueuse/motion';
import { useThrobberSync, THROBBER_BASE_PERIOD_MS } from './useThrobberSync';

export type ThrobberVariant = 'wave' | 'breathe' | 'ripple' | 'glow' | 'bounce' | 'pulse';
export type ThrobberColor = 'default' | 'primary' | 'muted' | 'secondary' | 'gradient' | 'white';
export type ThrobberSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ThrobberSpeed = 'slow' | 'normal' | 'fast';
export type ThrobberWeight = 'normal' | 'medium' | 'semibold' | 'bold';

const props = withDefaults(
  defineProps<{
    text?: string;
    variant?: ThrobberVariant;
    color?: ThrobberColor;
    size?: ThrobberSize;
    speed?: ThrobberSpeed;
    weight?: ThrobberWeight;
    dots?: boolean;
    nowrap?: boolean;
    tag?: string;
  }>(),
  {
    text: '',
    variant: 'wave',
    color: 'default',
    size: 'md',
    speed: 'normal',
    weight: 'semibold',
    dots: false,
    nowrap: false,
    tag: 'span',
  },
);

const { globalTime } = useThrobberSync();
const reducedMotion = useReducedMotion();

const displayText = computed(() => props.text || '');
const glyphs = computed(() => Array.from(displayText.value));

const speedMultiplier = computed(() => {
  if (props.speed === 'slow') return 1.5;
  if (props.speed === 'fast') return 0.75;
  return 1.0;
});

const periodMs = computed(() => THROBBER_BASE_PERIOD_MS * speedMultiplier.value);

const staggerMs = computed(() => {
  switch (props.variant) {
    case 'breathe':
    case 'pulse':
      return 25;
    case 'ripple':
      return 45;
    case 'bounce':
      return 40;
    case 'glow':
      return 55;
    case 'wave':
    default:
      return 40;
  }
});

const calculateWave = (offsetMs: number): number => {
  if (reducedMotion.value) return 1;
  const time = globalTime.value - offsetMs;
  const period = periodMs.value;
  const progress = (((time % period) + period) % period) / period;
  return (Math.sin(progress * 2 * Math.PI - Math.PI / 2) + 1) / 2;
};

const glyphStyle = (index: number) => {
  const wave = calculateWave(index * staggerMs.value);
  let opacity = 0.35 + 0.65 * wave;
  let transform = 'translateY(0)';
  let filter: string | undefined;

  switch (props.variant) {
    case 'breathe':
    case 'pulse':
      opacity = 0.4 + 0.6 * wave;
      transform = `scale(${(0.97 + 0.06 * wave).toFixed(3)})`;
      break;
    case 'ripple':
      opacity = 0.38 + 0.62 * wave;
      transform = `translateY(${(-4 * wave).toFixed(2)}px)`;
      break;
    case 'bounce':
      opacity = 0.45 + 0.55 * wave;
      transform = `translateY(${(-3.5 * wave).toFixed(2)}px) scale(${(1 + 0.08 * wave).toFixed(3)})`;
      break;
    case 'glow':
      opacity = 0.3 + 0.7 * wave;
      filter = `brightness(${(0.8 + 0.8 * wave).toFixed(2)})`;
      break;
    case 'wave':
    default:
      opacity = 0.35 + 0.65 * wave;
      transform = `translateY(${(-1.5 * wave).toFixed(2)}px)`;
      break;
  }

  return {
    opacity,
    transform,
    filter,
  };
};

const dotStyle = (dotIndex: number) => {
  const baseOffset = glyphs.value.length * staggerMs.value;
  const wave = calculateWave(baseOffset + dotIndex * 140);
  return {
    opacity: 0.25 + 0.75 * wave,
    transform: `translateY(${(-3 * wave).toFixed(2)}px)`,
  };
};
</script>

<template>
  <component
    :is="tag"
    class="throbber editor-loading-throbber"
    :class="[
      `throbber-variant-${variant}`,
      `throbber-color-${color}`,
      `throbber-size-${size}`,
      `throbber-weight-${weight}`,
    ]"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    :aria-label="displayText"
  >
    <span aria-hidden="true" class="throbber-content" :class="{ 'is-nowrap': nowrap }">
      <span
        v-for="(glyph, index) in glyphs"
        :key="`${variant}-${index}-${glyph}`"
        class="throbber-glyph editor-loading-glyph"
        :style="glyphStyle(index)"
        >{{ glyph === ' ' ? '\u00a0' : glyph }}</span
      >
      <span v-if="dots" class="throbber-dots">
        <span v-for="d in 3" :key="`dot-${d}`" class="throbber-dot" :style="dotStyle(d)">.</span>
      </span>
    </span>
  </component>
</template>

<style scoped>
.throbber {
  display: inline-flex;
  align-items: center;
  user-select: none;
}

.throbber-content {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
}

.throbber-content.is-nowrap {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.throbber-glyph {
  display: inline-block;
  will-change: opacity, transform;
  transition: none;
}

.throbber-dots {
  display: inline-flex;
  margin-left: 1px;
}

.throbber-dot {
  display: inline-block;
  will-change: opacity, transform;
  transition: none;
}

/* Colors */
.throbber-color-default {
  color: var(--text-primary);
}

.throbber-color-primary {
  color: var(--color-primary);
}

.throbber-color-muted {
  color: var(--text-muted);
}

.throbber-color-secondary {
  color: var(--text-secondary);
}

.throbber-color-white {
  color: #ffffff;
}

.throbber-color-gradient .throbber-glyph {
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    color-mix(in srgb, var(--color-primary) 75%, #ff8a00) 50%,
    #ffb347 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Sizes */
.throbber-size-xs {
  font-size: 11px;
  line-height: 1.3;
}

.throbber-size-sm {
  font-size: 13px;
  line-height: 1.35;
}

.throbber-size-md {
  font-size: 15px;
  line-height: 1.4;
  letter-spacing: -0.15px;
}

.throbber-size-lg {
  font-size: 18px;
  line-height: 1.4;
  letter-spacing: -0.25px;
}

.throbber-size-xl {
  font-size: 22px;
  line-height: 1.35;
  letter-spacing: -0.4px;
}

/* Weights */
.throbber-weight-normal {
  font-weight: 400;
}

.throbber-weight-medium {
  font-weight: 500;
}

.throbber-weight-semibold {
  font-weight: 650;
}

.throbber-weight-bold {
  font-weight: 750;
}
</style>
