<script setup lang="ts">
import { ref, type ComponentPublicInstance } from 'vue';
import { ArrowLeft, Blend } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ClipActionGroup from './clip/ClipActionGroup.vue';
import PropertiesSelectionSummary from './PropertiesSelectionSummary.vue';

defineProps<{
  title: string;
  transitionTitle: string;
  transitionName: string;
  transitionsOpen: boolean;
  showClipActions: boolean;
  clipTransitionable: boolean;
  showCanvasTransition: boolean;
  enabled: boolean;
  toggleable: boolean;
  enabledLabel: string;
  disabledLabel: string;
  deleteLabel: string;
  transitionButtonLabel: string;
  selectionNames?: string[];
}>();
const emit = defineEmits<{
  (event: 'back'): void;
  (event: 'toggle'): void;
  (event: 'delete'): void;
  (event: 'transition'): void;
  (event: 'after-enter'): void;
}>();
const transitionButton = ref<HTMLElement | ComponentPublicInstance | null>(null);
const focusTransitionButton = () => {
  const target = transitionButton.value;
  const element = target instanceof HTMLElement ? target : target?.$el instanceof HTMLElement ? target.$el : null;
  element?.querySelector<HTMLElement>('button')?.focus();
};
defineExpose({ focusTransitionButton });
</script>

<template>
  <div class="panel-header">
    <Transition :name="transitionName" mode="out-in" @after-enter="emit('after-enter')">
      <div :key="transitionsOpen ? 'transitions' : 'properties'" class="panel-header-view">
        <div v-if="transitionsOpen" class="panel-title-navigation">
          <Button variant="ghost" size="xs" :icon="ArrowLeft" icon-only aria-label="Back" @click="emit('back')" />
          <h3 class="panel-title">{{ transitionTitle }}</h3>
        </div>
        <div v-else class="panel-title-block">
          <h3 class="panel-title">{{ title }}</h3>
          <PropertiesSelectionSummary v-if="selectionNames?.length" :names="selectionNames" />
        </div>
        <ClipActionGroup
          v-if="showClipActions && !transitionsOpen"
          ref="transitionButton"
          class="panel-header-actions"
          :enabled="enabled"
          :toggleable="toggleable"
          :enabled-label="enabledLabel"
          :disabled-label="disabledLabel"
          :delete-label="deleteLabel"
          :transitionable="clipTransitionable"
          :transition-active="transitionsOpen"
          :transition-label="transitionButtonLabel"
          @toggle="emit('toggle')"
          @delete="emit('delete')"
          @transition="emit('transition')"
        />
        <ButtonGroup v-else-if="showCanvasTransition && !transitionsOpen" ref="transitionButton" size="xs">
          <Button
            variant="ghost"
            size="xs"
            :icon="Blend"
            icon-only
            :aria-label="transitionButtonLabel"
            :tooltip="transitionButtonLabel"
            @click="emit('transition')"
          />
        </ButtonGroup>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.panel-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  min-height: 64px;
  max-height: 64px;
  padding: 0 20px;
  box-sizing: border-box;
}
.panel-header-view {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
}
.panel-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-title-block {
  display: grid;
  width: 50%;
  min-width: 0;
}
.panel-title-navigation {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.panel-header-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}
.properties-panel-forward-enter-active,
.properties-panel-backward-enter-active {
  will-change: transform, opacity;
  transition:
    opacity 110ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 130ms cubic-bezier(0.16, 1, 0.3, 1);
}
.properties-panel-forward-leave-active,
.properties-panel-backward-leave-active {
  will-change: transform, opacity;
  transition:
    opacity 70ms ease-in,
    transform 80ms ease-in;
}
.properties-panel-forward-enter-to,
.properties-panel-forward-leave-from,
.properties-panel-backward-enter-to,
.properties-panel-backward-leave-from {
  transform: translate3d(0, 0, 0);
}
.properties-panel-forward-enter-from,
.properties-panel-backward-leave-to {
  opacity: 0;
  transform: translate3d(14px, 0, 0);
}
.properties-panel-forward-leave-to,
.properties-panel-backward-enter-from {
  opacity: 0;
  transform: translate3d(-9px, 0, 0);
}
@media (prefers-reduced-motion: reduce) {
  .properties-panel-forward-enter-active,
  .properties-panel-forward-leave-active,
  .properties-panel-backward-enter-active,
  .properties-panel-backward-leave-active {
    transition: none;
  }
}
</style>
