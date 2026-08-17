<script setup lang="ts">
withDefaults(
  defineProps<{
    mode?: 'default' | 'compact' | 'horizontal';
    transitionMode?: 'in-out' | 'out-in' | 'default';
  }>(),
  { mode: 'default', transitionMode: 'default' },
);

const onBeforeEnter = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = '0px';
  htmlEl.style.height = '0px';
  htmlEl.style.minHeight = '0px';
  htmlEl.style.opacity = '0';
};

const onEnter = (el: Element) => {
  const htmlEl = el as HTMLElement;
  const targetHeight = htmlEl.scrollHeight || htmlEl.offsetHeight || 32;
  htmlEl.style.maxHeight = `${targetHeight}px`;
  htmlEl.style.height = `${targetHeight}px`;
  htmlEl.style.opacity = '';
};

const onAfterEnter = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = '';
  htmlEl.style.height = '';
};

const onBeforeLeave = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = `${htmlEl.offsetHeight || htmlEl.scrollHeight}px`;
  htmlEl.style.minHeight = '0px';
  const computed = window.getComputedStyle(htmlEl);
  htmlEl.style.marginTop = computed.marginTop;
  htmlEl.style.marginBottom = computed.marginBottom;
  htmlEl.style.paddingTop = computed.paddingTop;
  htmlEl.style.paddingBottom = computed.paddingBottom;
  htmlEl.style.borderTopWidth = computed.borderTopWidth;
  htmlEl.style.borderBottomWidth = computed.borderBottomWidth;
  // Force layout reflow so the transition starts from exact rendered height & margin
  void htmlEl.offsetHeight;
};

const onLeave = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxHeight = '0px';
  htmlEl.style.minHeight = '0px';
  htmlEl.style.marginTop = '0px';
  htmlEl.style.marginBottom = '0px';
  htmlEl.style.paddingTop = '0px';
  htmlEl.style.paddingBottom = '0px';
  htmlEl.style.borderTopWidth = '0px';
  htmlEl.style.borderBottomWidth = '0px';
  htmlEl.style.opacity = '0';
};

const onBeforeEnterHorizontal = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxWidth = '0px';
  htmlEl.style.minWidth = '0px';
  htmlEl.style.opacity = '0';
};

const onEnterHorizontal = (el: Element) => {
  const htmlEl = el as HTMLElement;
  const targetWidth = htmlEl.scrollWidth || htmlEl.offsetWidth || 24;
  htmlEl.style.maxWidth = `${targetWidth}px`;
  htmlEl.style.opacity = '';
};

const onAfterEnterHorizontal = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxWidth = '';
};

const onBeforeLeaveHorizontal = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxWidth = `${htmlEl.offsetWidth || htmlEl.scrollWidth}px`;
  htmlEl.style.minWidth = '0px';
  const computed = window.getComputedStyle(htmlEl);
  htmlEl.style.marginLeft = computed.marginLeft;
  htmlEl.style.marginRight = computed.marginRight;
  htmlEl.style.paddingLeft = computed.paddingLeft;
  htmlEl.style.paddingRight = computed.paddingRight;
  htmlEl.style.borderLeftWidth = computed.borderLeftWidth;
  htmlEl.style.borderRightWidth = computed.borderRightWidth;
  // Force layout reflow so the horizontal transition starts from exact width & margin
  void htmlEl.offsetWidth;
};

const onLeaveHorizontal = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.maxWidth = '0px';
  htmlEl.style.minWidth = '0px';
  htmlEl.style.marginLeft = '0px';
  htmlEl.style.marginRight = '0px';
  htmlEl.style.paddingLeft = '0px';
  htmlEl.style.paddingRight = '0px';
  htmlEl.style.borderLeftWidth = '0px';
  htmlEl.style.borderRightWidth = '0px';
  htmlEl.style.opacity = '0';
};
</script>

<template>
  <Transition
    :name="`blur-reveal-${mode}`"
    :mode="transitionMode === 'default' ? undefined : transitionMode"
    @before-enter="mode === 'default' ? onBeforeEnter : mode === 'horizontal' ? onBeforeEnterHorizontal : undefined"
    @enter="mode === 'default' ? onEnter : mode === 'horizontal' ? onEnterHorizontal : undefined"
    @after-enter="mode === 'default' ? onAfterEnter : mode === 'horizontal' ? onAfterEnterHorizontal : undefined"
    @before-leave="mode === 'default' ? onBeforeLeave : mode === 'horizontal' ? onBeforeLeaveHorizontal : undefined"
    @leave="mode === 'default' ? onLeave : mode === 'horizontal' ? onLeaveHorizontal : undefined"
  >
    <slot />
  </Transition>
</template>

<style>
.blur-reveal-default-enter-active {
  overflow: hidden;
  will-change: max-height, min-height, opacity, transform, filter, margin, padding;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition:
    max-height 220ms cubic-bezier(0.16, 1, 0.3, 1),
    min-height 220ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 180ms cubic-bezier(0.16, 1, 0.3, 1),
    margin 220ms cubic-bezier(0.16, 1, 0.3, 1),
    padding 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.blur-reveal-default-leave-active {
  overflow: hidden;
  will-change: max-height, min-height, opacity, filter, margin, padding;
  backface-visibility: hidden;
  transition:
    max-height 190ms cubic-bezier(0.3, 0, 0.2, 1),
    min-height 190ms cubic-bezier(0.3, 0, 0.2, 1),
    opacity 150ms ease-out,
    filter 150ms ease-out,
    margin 190ms cubic-bezier(0.3, 0, 0.2, 1),
    padding 190ms cubic-bezier(0.3, 0, 0.2, 1),
    border-width 190ms cubic-bezier(0.3, 0, 0.2, 1);
}

.blur-reveal-compact-enter-active,
.blur-reveal-compact-leave-active {
  will-change: opacity, transform, filter;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  transition:
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.blur-reveal-horizontal-enter-active {
  overflow: hidden;
  will-change: max-width, min-width, opacity, transform, filter, margin-right;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  transition:
    max-width 220ms cubic-bezier(0.16, 1, 0.3, 1),
    min-width 220ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 180ms cubic-bezier(0.16, 1, 0.3, 1),
    margin-right 220ms cubic-bezier(0.16, 1, 0.3, 1);
  max-width: 24px;
}

.blur-reveal-horizontal-leave-active {
  overflow: hidden;
  will-change: max-width, min-width, opacity, transform, filter, margin-right;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  transition:
    max-width 190ms cubic-bezier(0.3, 0, 0.2, 1),
    min-width 190ms cubic-bezier(0.3, 0, 0.2, 1),
    opacity 150ms ease-out,
    transform 190ms cubic-bezier(0.3, 0, 0.2, 1),
    filter 150ms ease-out,
    margin-right 190ms cubic-bezier(0.3, 0, 0.2, 1);
  max-width: 24px;
}

.blur-reveal-default-enter-from {
  max-height: 0 !important;
  min-height: 0 !important;
  opacity: 0 !important;
  filter: blur(6px);
  transform: translate3d(0, -8px, 0);
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border-top-width: 0 !important;
  border-bottom-width: 0 !important;
}

.blur-reveal-default-leave-to {
  max-height: 0 !important;
  min-height: 0 !important;
  opacity: 0 !important;
  filter: blur(4px);
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border-top-width: 0 !important;
  border-bottom-width: 0 !important;
}

.blur-reveal-compact-enter-from,
.blur-reveal-compact-leave-to {
  opacity: 0 !important;
  filter: blur(4px);
  transform: translate3d(0, 0, 0);
}

.blur-reveal-horizontal-enter-from,
.blur-reveal-horizontal-leave-to {
  max-width: 0 !important;
  min-width: 0 !important;
  opacity: 0 !important;
  filter: blur(4px);
  transform: translate3d(-8px, 0, 0);
  margin-right: 0 !important;
  padding-right: 0 !important;
  padding-left: 0 !important;
}

@media (prefers-reduced-motion: reduce) {
  .blur-reveal-default-enter-active,
  .blur-reveal-default-leave-active,
  .blur-reveal-compact-enter-active,
  .blur-reveal-compact-leave-active,
  .blur-reveal-horizontal-enter-active,
  .blur-reveal-horizontal-leave-active {
    transition: opacity 100ms linear;
  }

  .blur-reveal-default-enter-from,
  .blur-reveal-default-leave-to,
  .blur-reveal-compact-enter-from,
  .blur-reveal-compact-leave-to,
  .blur-reveal-horizontal-enter-from,
  .blur-reveal-horizontal-leave-to {
    filter: none;
    transform: none;
  }
}
</style>
