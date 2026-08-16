<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { ScrollOrientation } from './scroll-shadow-types';
import { useScrollShadow } from './useScrollShadow';

const props = withDefaults(
  defineProps<{
    as?: string;
    orientation?: ScrollOrientation;
    offset?: number;
    size?: number | string;
    viewportClass?: any;
    hideScrollbar?: boolean;
    isEnabled?: boolean;
  }>(),
  {
    as: 'div',
    orientation: 'vertical',
    offset: 2,
    size: '24px',
    viewportClass: '',
    hideScrollbar: false,
    isEnabled: true,
  },
);

const viewportRef = ref<HTMLElement | null>(null);

const { hasTopShadow, hasBottomShadow, hasLeftShadow, hasRightShadow, isScrollableY, isScrollableX, updateShadows } =
  useScrollShadow(viewportRef, {
    offset: props.offset,
    orientation: props.orientation,
    isEnabled: toRef(props, 'isEnabled'),
  });

const maskStyle = computed(() => {
  const sizeStr = typeof props.size === 'number' ? `${props.size}px` : props.size;
  const isVert = props.orientation === 'vertical' || props.orientation === 'both';
  const isHoriz = props.orientation === 'horizontal' || props.orientation === 'both';

  const masks: string[] = [];

  if (isVert) {
    const top = hasTopShadow.value;
    const bottom = hasBottomShadow.value;
    if (top && bottom) {
      masks.push(
        `linear-gradient(to bottom, transparent 0%, black ${sizeStr}, black calc(100% - ${sizeStr}), transparent 100%)`,
      );
    } else if (top) {
      masks.push(`linear-gradient(to bottom, transparent 0%, black ${sizeStr}, black 100%)`);
    } else if (bottom) {
      masks.push(`linear-gradient(to bottom, black 0%, black calc(100% - ${sizeStr}), transparent 100%)`);
    }
  }

  if (isHoriz) {
    const left = hasLeftShadow.value;
    const right = hasRightShadow.value;
    if (left && right) {
      masks.push(
        `linear-gradient(to right, transparent 0%, black ${sizeStr}, black calc(100% - ${sizeStr}), transparent 100%)`,
      );
    } else if (left) {
      masks.push(`linear-gradient(to right, transparent 0%, black ${sizeStr}, black 100%)`);
    } else if (right) {
      masks.push(`linear-gradient(to right, black 0%, black calc(100% - ${sizeStr}), transparent 100%)`);
    }
  }

  if (masks.length === 0) return {};

  const maskValue = masks.join(', ');
  return {
    maskImage: maskValue,
    WebkitMaskImage: maskValue,
  };
});

defineExpose({
  viewportRef,
  hasTopShadow,
  hasBottomShadow,
  hasLeftShadow,
  hasRightShadow,
  isScrollableY,
  isScrollableX,
  updateShadows,
});
</script>

<template>
  <component :is="as" class="scroll-shadow-root">
    <div
      ref="viewportRef"
      class="scroll-shadow-viewport"
      :class="[viewportClass, { 'hide-scrollbar': hideScrollbar }]"
      :style="maskStyle"
    >
      <slot />
    </div>
  </component>
</template>

<style scoped>
.scroll-shadow-root {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.scroll-shadow-viewport {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.scroll-shadow-viewport.hide-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scroll-shadow-viewport.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
