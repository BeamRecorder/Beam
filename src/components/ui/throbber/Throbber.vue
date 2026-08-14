<script setup lang="ts">
import { computed } from 'vue';
import { MotionComponent, useReducedMotion, type Variant } from '@vueuse/motion';

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
    tag: 'span',
  },
);

const reducedMotion = useReducedMotion();
const displayText = computed(() => props.text || '');
const glyphs = computed(() => Array.from(displayText.value));

const speedMultiplier = computed(() => {
  if (props.speed === 'slow') return 1.5;
  if (props.speed === 'fast') return 0.7;
  return 1.0;
});

const initialVariant = computed<Variant>(() => ({
  opacity: reducedMotion.value ? 1 : 0.38,
  y: 0,
  scale: 1,
}));

const enterVariant = (index: number): Variant => {
  if (reducedMotion.value) {
    return { opacity: 1, y: 0, scale: 1, transition: { immediate: true } };
  }

  const mul = speedMultiplier.value;

  switch (props.variant) {
    case 'breathe':
    case 'pulse':
      return {
        opacity: [0.4, 1, 0.4],
        scale: [0.98, 1.02, 0.98],
        transition: {
          type: 'keyframes',
          duration: 1.8 * mul,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
          repeat: Infinity,
          repeatType: 'loop',
          delay: index * 0.015 * mul,
        },
      } as unknown as Variant;

    case 'ripple':
      return {
        opacity: [0.4, 1, 0.4],
        y: [0, -4, 0],
        transition: {
          type: 'keyframes',
          duration: 1.0 * mul,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
          repeat: Infinity,
          repeatType: 'loop',
          delay: index * 0.045 * mul,
        },
      } as unknown as Variant;

    case 'bounce':
      return {
        opacity: [0.5, 1, 0.5],
        y: [0, -3.5, 0],
        scale: [1, 1.08, 1],
        transition: {
          type: 'keyframes',
          duration: 0.9 * mul,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
          repeat: Infinity,
          repeatType: 'loop',
          delay: index * 0.04 * mul,
        },
      } as unknown as Variant;

    case 'glow':
      return {
        opacity: [0.4, 1, 0.4],
        filter: ['brightness(0.9)', 'brightness(1.4)', 'brightness(0.9)'],
        transition: {
          type: 'keyframes',
          duration: 1.2 * mul,
          ease: 'easeInOut',
          times: [0, 0.45, 1],
          repeat: Infinity,
          repeatType: 'loop',
          delay: index * 0.04 * mul,
        },
      } as unknown as Variant;

    case 'wave':
    default:
      return {
        opacity: [0.38, 1, 0.38],
        transition: {
          type: 'keyframes',
          duration: 1.1 * mul,
          ease: 'easeInOut',
          times: [0, 0.45, 1],
          repeat: Infinity,
          repeatType: 'loop',
          delay: index * 0.035 * mul,
        },
      } as unknown as Variant;
  }
};

const dotVariant = (dotIndex: number): Variant => {
  if (reducedMotion.value) {
    return { opacity: 1, y: 0, transition: { immediate: true } };
  }

  const mul = speedMultiplier.value;
  return {
    opacity: [0.25, 1, 0.25],
    y: [0, -3, 0],
    transition: {
      type: 'keyframes',
      duration: 0.9 * mul,
      ease: 'easeInOut',
      times: [0, 0.5, 1],
      repeat: Infinity,
      repeatType: 'loop',
      delay: (glyphs.value.length * 0.02 + dotIndex * 0.15) * mul,
    },
  } as unknown as Variant;
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
    <span aria-hidden="true" class="throbber-content">
      <MotionComponent
        v-for="(glyph, index) in glyphs"
        :key="`${reducedMotion ? 'static' : 'animated'}-${variant}-${index}-${glyph}`"
        is="span"
        class="throbber-glyph editor-loading-glyph"
        :initial="initialVariant"
        :enter="enterVariant(index)"
        >{{ glyph === ' ' ? '\u00a0' : glyph }}</MotionComponent
      >
      <span v-if="dots" class="throbber-dots">
        <MotionComponent
          v-for="d in 3"
          :key="`dot-${d}`"
          is="span"
          class="throbber-dot"
          :initial="{ opacity: reducedMotion ? 1 : 0.25, y: 0 }"
          :enter="dotVariant(d)"
          >.</MotionComponent
        >
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

.throbber-glyph {
  display: inline-block;
  will-change: opacity, transform;
}

.throbber-dots {
  display: inline-flex;
  margin-left: 1px;
}

.throbber-dot {
  display: inline-block;
  will-change: opacity, transform;
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

.throbber-color-gradient {
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    color-mix(in srgb, var(--color-primary) 75%, #ff8a00) 50%,
    #ffb347 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
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

@media (prefers-reduced-motion: reduce) {
  .throbber-glyph,
  .throbber-dot {
    will-change: auto;
  }
}
</style>
