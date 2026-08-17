<script setup lang="ts">
withDefaults(
  defineProps<{
    mode?: 'default' | 'compact';
    transitionMode?: 'in-out' | 'out-in' | 'default';
  }>(),
  { mode: 'default', transitionMode: 'default' },
);

const onBeforeEnter = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = '0px';
  htmlEl.style.opacity = '0';
};

const onEnter = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = `${htmlEl.scrollHeight}px`;
  htmlEl.style.opacity = '';
};

const onAfterEnter = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = '';
};

const onBeforeLeave = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = `${htmlEl.scrollHeight}px`;
  // Force layout reflow so the transition starts from exact scrollHeight
  void htmlEl.offsetHeight;
};

const onLeave = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = '0px';
  htmlEl.style.opacity = '0';
};
</script>

<template>
  <Transition
    :name="`blur-reveal-${mode}`"
    :mode="transitionMode === 'default' ? undefined : transitionMode"
    @before-enter="mode === 'default' ? onBeforeEnter : undefined"
    @enter="mode === 'default' ? onEnter : undefined"
    @after-enter="mode === 'default' ? onAfterEnter : undefined"
    @before-leave="mode === 'default' ? onBeforeLeave : undefined"
    @leave="mode === 'default' ? onLeave : undefined"
  >
    <slot />
  </Transition>
</template>

<style>
.blur-reveal-default-enter-active,
.blur-reveal-default-leave-active {
  overflow: hidden;
  will-change: max-height, opacity, transform, filter, margin;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  transition:
    max-height 260ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 220ms cubic-bezier(0.16, 1, 0.3, 1),
    margin 260ms cubic-bezier(0.16, 1, 0.3, 1),
    padding 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.blur-reveal-compact-enter-active,
.blur-reveal-compact-leave-active {
  will-change: opacity, transform, filter;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  transition:
    opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.blur-reveal-default-enter-from,
.blur-reveal-default-leave-to {
  max-height: 0 !important;
  opacity: 0 !important;
  filter: blur(6px);
  transform: translate3d(0, -6px, 0) scale3d(0.97, 0.97, 1);
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.blur-reveal-compact-enter-from,
.blur-reveal-compact-leave-to {
  opacity: 0 !important;
  filter: blur(4px);
  transform: translate3d(0, 0, 0) scale3d(0.92, 0.92, 1);
}

@media (prefers-reduced-motion: reduce) {
  .blur-reveal-default-enter-active,
  .blur-reveal-default-leave-active,
  .blur-reveal-compact-enter-active,
  .blur-reveal-compact-leave-active {
    transition: opacity 100ms linear;
  }

  .blur-reveal-default-enter-from,
  .blur-reveal-default-leave-to,
  .blur-reveal-compact-enter-from,
  .blur-reveal-compact-leave-to {
    filter: none;
    transform: none;
  }
}
</style>
