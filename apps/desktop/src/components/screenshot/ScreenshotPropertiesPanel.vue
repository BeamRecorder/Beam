<script setup lang="ts">
import ScreenshotPropertiesPosition from './ScreenshotPropertiesPosition.vue';
import type { ScreenshotPropertiesPosition as PropertiesPosition } from './screenshot-properties-types';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import Button from '~/ui/button/Button.vue';
import { X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import PropertiesPanelHeader from '../editor/properties/PropertiesPanelHeader.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
withDefaults(defineProps<{ title: string; open: boolean; position?: PropertiesPosition; dockSaving?: boolean }>(), {
  position: 'left',
  dockSaving: false,
});
const emit = defineEmits<{ close: []; 'update:position': [value: PropertiesPosition] }>();
const { t } = useI18n();
</script>

<template>
  <RafRevealTransition axis="horizontal">
    <aside
      v-show="open || position !== 'floating'"
      id="screenshot-properties-panel"
      class="properties-island screenshot-chrome screenshot-panel"
      :class="{ 'is-docked': position !== 'floating', 'is-right': position === 'right' }"
      :aria-label="title"
      :inert="(!open && position === 'floating') || undefined"
    >
      <div class="properties-scale-content">
        <PropertiesPanelHeader :title="title">
          <template v-if="$slots.title" #title><slot name="title" /></template>
          <template #actions>
            <div class="inspector-actions">
              <slot name="actions" />
              <ScreenshotPropertiesPosition
                :model-value="position"
                :disabled="dockSaving"
                @update:model-value="emit('update:position', $event)"
              />
              <Button
                v-if="position === 'floating'"
                variant="ghost"
                size="xs"
                icon-only
                :icon="X"
                :aria-label="t('Dialog.close')"
                :tooltip="t('Dialog.close')"
                @click="emit('close')"
              />
            </div>
          </template>
        </PropertiesPanelHeader>
        <ScrollShadow
          class="panel-scroll-shadow"
          :class="{ 'has-footer': $slots.footer }"
          viewport-class="panel-content"
          stable-scrollbar
        >
          <div class="panel-body"><slot /></div>
        </ScrollShadow>
        <footer v-if="$slots.footer" class="properties-footer">
          <slot name="footer" />
        </footer>
      </div>
    </aside>
  </RafRevealTransition>
</template>

<style scoped src="../editor/properties/PropertiesPanel.css"></style>
<style scoped src="./screenshot-chrome.css"></style>
<style scoped>
.properties-island {
  --screenshot-inspector-width: var(--editor-screenshot-inspector-width);
  width: var(--screenshot-inspector-width);
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  animation: none;
  overflow: hidden;
  position: absolute;
  inset: 12px auto 12px 12px;
  height: calc(100% - 24px);
  z-index: 13;
}
.properties-island.is-docked {
  position: relative;
  inset: auto;
  height: 100%;
  align-self: stretch;
  border-radius: 0;
  border: 0;
  border-right: 1px solid var(--color-border);
  box-shadow: none;
}
.properties-island.is-right {
  order: 1;
  border-right: 0;
  border-left: 1px solid var(--color-border);
}
.panel-body {
  min-height: 0;
}
.properties-footer {
  background: transparent;
}
.properties-scale-content {
  overflow: hidden;
  border-radius: inherit;
  width: calc((var(--screenshot-inspector-width) - 2px) / var(--ui-scale-properties, 1));
  flex-shrink: 0;
}
.inspector-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
