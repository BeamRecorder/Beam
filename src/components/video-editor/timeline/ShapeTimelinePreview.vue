<script setup lang="ts">
import { computed } from 'vue';
import type { ShapeClip } from '~/media/shared/composition-types';

const props = defineProps<{ clip: ShapeClip }>();
const previewStyle = computed(() => {
  const preset = props.clip.preset;
  const clipPath =
    preset === 'ellipse'
      ? 'ellipse(46% 42% at 50% 50%)'
      : preset === 'triangle'
        ? 'polygon(50% 8%, 94% 90%, 6% 90%)'
        : preset === 'diamond'
          ? 'polygon(50% 5%, 95% 50%, 50% 95%, 5% 50%)'
          : preset === 'star'
            ? 'polygon(50% 3%, 61% 35%, 96% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 4% 35%, 39% 35%)'
            : preset === 'arrow'
              ? 'polygon(5% 34%, 62% 34%, 62% 9%, 96% 50%, 62% 91%, 62% 66%, 5% 66%)'
              : 'inset(8%)';
  return {
    background: props.clip.fillColor,
    borderRadius: preset === 'rounded-rectangle' ? `${Math.max(0, props.clip.cornerRadius / 2)}px` : undefined,
    clipPath,
    backdropFilter:
      props.clip.opacityEnabled && props.clip.backdropBlur > 0
        ? `blur(${Math.max(1, props.clip.backdropBlur / 20)}px)`
        : undefined,
    opacity: props.clip.opacityEnabled ? props.clip.opacity / 100 : 1,
    transform: `rotate(${props.clip.rotation}deg)`,
  };
});
</script>

<template>
  <span class="shape-preview-wrap" aria-hidden="true">
    <span class="shape-preview" :style="previewStyle" />
  </span>
</template>

<style scoped>
.shape-preview-wrap {
  position: absolute;
  inset: 3px 5px;
  overflow: hidden;
}
.shape-preview {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: center;
}
</style>
