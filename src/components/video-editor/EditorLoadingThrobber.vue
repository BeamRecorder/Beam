<script setup lang="ts">
import { computed } from 'vue';
import { MotionComponent, useReducedMotion, type Variant } from '@vueuse/motion';

const props = defineProps<{
  text: string;
}>();

const reducedMotion = useReducedMotion();
const glyphs = computed(() => Array.from(props.text));

const initialVariant = computed<Variant>(() => ({
  opacity: reducedMotion.value ? 1 : 0.38,
}));

const enterVariant = (index: number): Variant => {
  if (reducedMotion.value) return { opacity: 1, transition: { immediate: true } };

  return {
    opacity: [0.38, 1, 0.38],
    transition: {
      type: 'keyframes',
      duration: 1.1,
      ease: 'easeInOut',
      times: [0, 0.45, 1],
      repeat: Infinity,
      repeatType: 'loop',
      delay: index * 0.035,
    },
  } as unknown as Variant;
};
</script>

<template>
  <span class="editor-loading-throbber" role="status" aria-atomic="true" :aria-label="text">
    <span aria-hidden="true">
      <MotionComponent
        v-for="(glyph, index) in glyphs"
        :key="`${reducedMotion ? 'static' : 'animated'}-${index}-${glyph}`"
        is="span"
        class="editor-loading-glyph"
        :initial="initialVariant"
        :enter="enterVariant(index)"
        >{{ glyph === ' ' ? '\u00a0' : glyph }}</MotionComponent
      >
    </span>
  </span>
</template>

<style scoped>
.editor-loading-throbber {
  display: inline-flex;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.2px;
  line-height: 1.4;
}

.editor-loading-glyph {
  display: inline-block;
  will-change: opacity;
}

@media (prefers-reduced-motion: reduce) {
  .editor-loading-glyph {
    will-change: auto;
  }
}
</style>
