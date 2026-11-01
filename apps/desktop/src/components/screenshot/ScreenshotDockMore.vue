<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { Ellipsis } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import type { PopoverMenuItem } from '~/ui/popover/popover-menu-types';
import { useI18n } from 'vue-i18n';

defineProps<{ items: PopoverMenuItem[]; disabled: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const { t } = useI18n();
const trigger = ref<HTMLElement | null>(null);
const dismiss = (close: () => void) => {
  close();
  void nextTick(() => trigger.value?.querySelector<HTMLButtonElement>('button')?.focus());
};
const select = (id: string, close: () => void) => {
  emit('select', id);
  dismiss(close);
};
</script>
<template>
  <Popover direction="up" flush :disabled="disabled" :match-trigger-width="false" allow-overflow>
    <template #trigger="{ isOpen }">
      <div ref="trigger" class="dock-more-trigger">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="Ellipsis"
          :disabled="disabled"
          :aria-label="t('ScreenshotEditor.moreTools')"
          :tooltip="t('ScreenshotEditor.moreTools')"
          aria-haspopup="menu"
          :aria-expanded="isOpen"
          style="width: 36px; height: 36px; padding: 0"
        />
      </div>
    </template>
    <template #default="{ close }">
      <div class="dock-customize-menu">
        <header class="dock-menu-heading">
          <h3>{{ t('ScreenshotEditor.personalizeDock') }}</h3>
          <p>{{ t('ScreenshotEditor.customizeDockHint') }}</p>
        </header>
        <h4 class="dock-menu-section">{{ t('ScreenshotEditor.moreTools') }}</h4>
        <PopoverMenuList
          class="dock-more-items"
          :items="items"
          @select="select($event, close)"
          @dismiss="dismiss(close)"
        />
      </div>
    </template>
  </Popover>
</template>
<style scoped>
.dock-more-trigger {
  display: flex;
}
.dock-customize-menu {
  width: 264px;
  max-width: calc(100vw - 32px);
}
.dock-more-items {
  width: 100%;
  max-width: 100%;
}
.dock-menu-heading {
  max-width: 250px;
  padding: 12px 12px 8px;
}
.dock-menu-heading h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: 600;
}
.dock-menu-heading p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.dock-menu-section {
  margin: 0;
  padding: 4px 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 500;
}
</style>
