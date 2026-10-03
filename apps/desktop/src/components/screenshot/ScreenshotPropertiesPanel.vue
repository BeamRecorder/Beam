<script setup lang="ts">
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import Button from '~/ui/button/Button.vue';
import { PanelLeftClose } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import PropertiesPanelHeader from '../editor/properties/PropertiesPanelHeader.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
defineProps<{ title: string; open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
</script>

<template>
  <RafRevealTransition axis="horizontal">
    <aside
      v-show="open"
      id="screenshot-properties-panel"
      class="properties-island"
      :aria-label="title"
      :inert="!open || undefined"
    >
      <div class="properties-scale-content">
        <PropertiesPanelHeader :title="title">
          <template v-if="$slots.title" #title><slot name="title" /></template>
          <template #actions>
            <div class="inspector-actions">
              <slot name="actions" />
              <Button
                variant="ghost"
                size="xs"
                icon-only
                :icon="PanelLeftClose"
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
<style scoped>
.properties-island {
  --screenshot-inspector-width: var(--editor-screenshot-inspector-width);
  width: var(--screenshot-inspector-width);
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  animation: none;
}
.properties-scale-content {
  width: calc((var(--screenshot-inspector-width) - 2px) / var(--ui-scale-properties, 1));
  flex-shrink: 0;
}
.inspector-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
