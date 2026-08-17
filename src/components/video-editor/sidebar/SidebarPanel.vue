<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Monitor, Film, ZoomIn, MousePointer, Type, Volume2, Settings } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import UpdateAvailableBadge from '~/components/updates/UpdateAvailableBadge.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';

const { t } = useTranslate('SidebarPanel');

defineProps<{
  activeTab: string;
}>();

const emit = defineEmits<{
  (e: 'select-tab', tab: string): void;
}>();
const sidebarRef = ref<HTMLElement | null>(null);
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
};

onMounted(() => {
  void nextTick(updateLabelVisibility);
  if (typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(updateLabelVisibility);
  if (sidebarRef.value) resizeObserver.observe(sidebarRef.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

const menuItems = computed(() => [
  { id: 'canvas', label: t('canvas'), icon: Monitor },
  { id: 'clip', label: t('clip'), icon: Film },
  { id: 'zoom', label: t('zoom'), icon: ZoomIn },
  { id: 'cursor', label: t('cursor'), icon: MousePointer },
  { id: 'caption', label: t('captions'), icon: Type },
  { id: 'audio', label: t('audio'), icon: Volume2 },
]);
</script>

<template>
  <aside ref="sidebarRef" class="sidebar-island" :class="{ 'labels-hidden': !showLabels }">
    <ScrollShadow class="sidebar-scroll-wrapper" viewport-class="sidebar-viewport">
      <nav class="nav-menu">
        <Tooltip
          v-for="item in menuItems"
          :key="item.id"
          class="nav-tooltip"
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
  width: calc(92px * var(--ui-scale-sidebar, 1));
  height: 100%;
  max-height: 100%;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: calc(12px * var(--ui-scale-sidebar, 1)) calc(6px * var(--ui-scale-sidebar, 1));
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
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
  background: var(--color-primary, #ff5a1f) !important;
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  flex-shrink: 0;
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
  height: 52px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  display: grid;
  grid-template-rows: 18px minmax(15px, auto);
  place-content: center;
  justify-items: center;
  row-gap: 3px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.labels-hidden .nav-btn {
  height: 38px;
  grid-template-rows: 18px;
}

.nav-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.nav-btn.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
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
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.2px;
}
</style>
