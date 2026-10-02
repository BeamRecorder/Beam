<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Monitor, Film, ZoomIn, MousePointer, Type, Volume2, Settings } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import UpdateAvailableBadge from '~/components/updates/UpdateAvailableBadge.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import SelectionIndicator from '~/ui/transitions/SelectionIndicator.vue';
import { useSidebarSelectionIndicator } from './useSidebarSelectionIndicator';
import EditorSpotlight from '../search/EditorSpotlight.vue';
import { editorSearchKey } from '../search/editor-search-types';

import type { SidebarMenuItem } from './sidebar-types';

const { t } = useTranslate('SidebarPanel');

const props = withDefaults(
  defineProps<{
    activeTab: string;
    panelOpen?: boolean;
    items?: SidebarMenuItem[];
  }>(),
  {
    panelOpen: true,
  },
);

const emit = defineEmits<{
  (e: 'select-tab', tab: string): void;
}>();
const search = inject(editorSearchKey, null);
const navigateFromSearch = (tab: string) => {
  if (tab !== props.activeTab || !props.panelOpen) emit('select-tab', tab);
};
const sidebarRef = ref<HTMLElement | null>(null);
const {
  style: selectionStyle,
  instant: selectionInstant,
  update: updateSelection,
} = useSidebarSelectionIndicator(sidebarRef);
const showLabels = ref(true);
let resizeObserver: ResizeObserver | null = null;

const updateLabelVisibility = () => {
  const sidebar = sidebarRef.value;
  if (!sidebar) return;
  const configuredScale = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--ui-scale-sidebar'),
  );
  const scale = Number.isFinite(configuredScale) && configuredScale > 0 ? configuredScale : 1;
  showLabels.value = sidebar.clientWidth >= 82 * scale && sidebar.clientHeight >= 430 * scale;
  updateSelection();
};

onMounted(() => {
  void nextTick(updateLabelVisibility);
  if (typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(updateLabelVisibility);
  if (sidebarRef.value) resizeObserver.observe(sidebarRef.value);
  const menu = sidebarRef.value?.querySelector('.nav-menu');
  if (menu) resizeObserver.observe(menu);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

const menuItems = computed(
  () =>
    props.items ?? [
      { id: 'canvas', label: t('canvas'), icon: Monitor },
      { id: 'clip', label: t('clip'), icon: Film },
      { id: 'zoom', label: t('zoom'), icon: ZoomIn },
      { id: 'cursor', label: t('cursor'), icon: MousePointer },
      { id: 'caption', label: t('captions'), icon: Type },
      { id: 'audio', label: t('audio'), icon: Volume2 },
    ],
);
watch(
  () => props.activeTab,
  () => updateSelection(true),
  { flush: 'post' },
);
watch(menuItems, () => updateSelection(), { flush: 'post' });
</script>

<template>
  <aside ref="sidebarRef" class="sidebar-island" :class="{ 'labels-hidden': !showLabels }">
    <EditorSpotlight v-if="search" :navigate="navigateFromSearch" />
    <SelectionIndicator
      v-if="selectionStyle"
      class="sidebar-selection"
      :style="selectionStyle"
      :instant="selectionInstant"
    />
    <ScrollShadow class="sidebar-scroll-wrapper" viewport-class="sidebar-viewport" @scroll.capture="updateSelection()">
      <nav class="nav-menu">
        <Tooltip
          v-for="item in menuItems"
          :key="item.id"
          class="nav-tooltip"
          :class="{ 'effects-entry': item.id === 'zoom' }"
          :style="{ display: 'block', width: '100%' }"
          :content="item.label"
          position="right"
          :disabled="showLabels"
        >
          <button
            type="button"
            class="nav-btn"
            :class="{ active: activeTab === item.id }"
            :aria-label="item.label"
            :aria-expanded="activeTab === item.id ? panelOpen : undefined"
            :title="item.label"
            @click="emit('select-tab', item.id)"
          >
            <component :is="item.icon" class="nav-icon" />
            <span v-if="showLabels" class="nav-label">{{ item.label }}</span>
          </button>
        </Tooltip>
      </nav>
    </ScrollShadow>

    <div class="sidebar-footer">
      <Tooltip
        class="nav-tooltip"
        :style="{ display: 'block', width: '100%' }"
        :content="t('settings')"
        position="right"
        :disabled="showLabels"
      >
        <button
          type="button"
          class="nav-btn footer-btn"
          :class="{ active: activeTab === 'settings' }"
          :aria-label="t('settings')"
          :aria-expanded="activeTab === 'settings' ? panelOpen : undefined"
          :title="t('settings')"
          @click="emit('select-tab', 'settings')"
        >
          <Settings class="nav-icon" />
          <span v-if="showLabels" class="nav-label">{{ t('settings') }}</span>
          <UpdateAvailableBadge />
        </button>
      </Tooltip>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-island {
  position: relative;
  isolation: isolate;
  width: calc(92px * var(--ui-scale-sidebar, 1));
  height: 100%;
  max-height: 100%;
  background: transparent;
  border: 0;
  padding: 0 calc(6px * var(--ui-scale-sidebar, 1));
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
}

.sidebar-selection {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  border-radius: calc(var(--radius-sm) * var(--ui-scale-sidebar, 1));
  background: var(--color-primary);
}

.sidebar-scroll-wrapper {
  zoom: var(--ui-scale-sidebar, 1);
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.sidebar-viewport) {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

:deep(.sidebar-viewport::-webkit-scrollbar) {
  width: 5px;
}

:deep(.sidebar-viewport::-webkit-scrollbar-track) {
  background: transparent;
  margin-block: 10px;
}

:deep(.sidebar-viewport::-webkit-scrollbar-thumb) {
  background: var(--color-border-strong);
  border-radius: 9999px;
  transition: background 0.2s ease-in-out;
}

:deep(.sidebar-viewport::-webkit-scrollbar-thumb:hover) {
  background: var(--text-muted);
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  flex-shrink: 0;
}

.effects-entry {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border);
}

.sidebar-footer {
  zoom: var(--ui-scale-sidebar, 1);
  width: 100%;
  flex-shrink: 0;
  padding-top: 8px;
}

.nav-btn {
  position: relative;
  width: 100%;
  height: 48px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  display: grid;
  grid-template-rows: 18px minmax(15px, auto);
  place-content: center;
  justify-items: center;
  row-gap: 3px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.labels-hidden .nav-btn {
  grid-template-rows: 18px;
}

.nav-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.nav-btn.active {
  background: transparent;
  color: var(--text-on-primary);
}

.nav-btn:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 2px;
}

.nav-icon {
  width: 18px;
  height: 18px;
  display: block;
}

.nav-label {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-block: 1px;
  line-height: 1.4;
  box-sizing: border-box;
  font-size: var(--font-size-sm);
  font-weight: var(--weight-title);
}

.nav-btn.active .nav-label {
  font-weight: var(--weight-display);
}
</style>
