<script setup lang="ts">
import { computed } from 'vue';

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

const displayText = computed(() => props.text || '');
const glyphs = computed(() => Array.from(displayText.value));

const speedMultiplier = computed(() => {
  if (props.speed === 'slow') return 1.5;
  if (props.speed === 'fast') return 0.7;
  return 1.0;
});

const glyphStyle = (index: number) => {
  const mul = speedMultiplier.value;
  let delay = 0;
  let duration = 1.1;

  switch (props.variant) {
    case 'breathe':
    case 'pulse':
      duration = 1.8;
      delay = index * 0.02;
      break;
    case 'ripple':
      duration = 1.0;
      delay = index * 0.045;
      break;
    case 'bounce':
      duration = 0.9;
      delay = index * 0.04;
      break;
    case 'glow':
    case 'shimmer':
      duration = 1.3;
      delay = index * 0.055;
      break;
    case 'wave':
    default:
      duration = 1.1;
      delay = index * 0.035;
      break;
  }

  return {
    animationDuration: `${duration * mul}s`,
    animationDelay: `${delay * mul}s`,
  };
};

const dotStyle = (dotIndex: number) => {
  const mul = speedMultiplier.value;
  const baseDelay = glyphs.value.length * 0.025;
  return {
    animationDuration: `${0.9 * mul}s`,
    animationDelay: `${(baseDelay + dotIndex * 0.15) * mul}s`,
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
    <span aria-hidden="true" class="throbber-content">
      <span
        v-for="(glyph, index) in glyphs"
        :key="`${variant}-${index}-${glyph}`"
        class="throbber-glyph editor-loading-glyph"
        :style="glyphStyle(index)"
        >{{ glyph === ' ' ? '\u00a0' : glyph }}</span
      >
      <span v-if="dots" class="throbber-dots">
        <span
          v-for="d in 3"
          :key="`dot-${d}`"
          class="throbber-dot"
          :style="dotStyle(d)"
          >.</span
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
  animation: throbber-dot-bounce 0.9s ease-in-out infinite;
}

/* Animations */
.throbber-variant-wave .throbber-glyph {
  animation: throbber-wave 1.1s ease-in-out infinite;
}

.throbber-variant-breathe .throbber-glyph,
.throbber-variant-pulse .throbber-glyph {
  animation: throbber-breathe 1.8s ease-in-out infinite;
}

.throbber-variant-ripple .throbber-glyph {
  animation: throbber-ripple 1.0s ease-in-out infinite;
}

.throbber-variant-bounce .throbber-glyph {
  animation: throbber-bounce 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
}

.throbber-variant-glow .throbber-glyph,
.throbber-variant-shimmer .throbber-glyph {
  animation: throbber-glow 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes throbber-wave {
  0%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes throbber-breathe {
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.97);
  }
  50% {
    opacity: 1;
    transform: scale(1.03);
  }
}

@keyframes throbber-ripple {
  0%, 100% {
    opacity: 0.38;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

@keyframes throbber-bounce {
  0%, 100% {
    opacity: 0.45;
    transform: translateY(0) scale(1);
  }
  45% {
    opacity: 1;
    transform: translateY(-3.5px) scale(1.08);
  }
}

@keyframes throbber-glow {
  0% {
    opacity: 0.25;
    filter: brightness(0.75);
  }
  35% {
    opacity: 1;
    filter: brightness(1.6) contrast(1.08);
  }
  70%, 100% {
    opacity: 0.25;
    filter: brightness(0.75);
  }
}

@keyframes throbber-dot-bounce {
  0%, 100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
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
