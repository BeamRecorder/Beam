<script setup lang="ts">
import { computed } from 'vue';
import { Monitor, Film, ZoomIn, MousePointer, Type, Volume2, Settings } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import UpdateAvailableBadge from '~/components/updates/UpdateAvailableBadge.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';

const { t } = useTranslate('SidebarPanel');

defineProps<{
  activeTab: string;
}>();

const emit = defineEmits<{
  (e: 'select-tab', tab: string): void;
}>();

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
  <aside class="sidebar-island">
    <ScrollShadow class="sidebar-scroll-wrapper" viewport-class="sidebar-viewport">
      <nav class="nav-menu">
        <button
          v-for="item in menuItems"
          :key="item.id"
          class="nav-btn"
          :class="{ active: activeTab === item.id }"
          @click="emit('select-tab', item.id)"
          :title="item.label"
        >
          <component :is="item.icon" class="nav-icon" />
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>
    </ScrollShadow>

    <div class="sidebar-footer">
      <button
        class="nav-btn footer-btn"
        :class="{ active: activeTab === 'settings' }"
        @click="emit('select-tab', 'settings')"
        :title="t('settings')"
      >
        <Settings class="nav-icon" />
        <span class="nav-label">{{ t('settings') }}</span>
        <UpdateAvailableBadge />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-island {
  width: 92px;
  height: 100%;
  max-height: 100%;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 12px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  box-sizing: border-box;
}

.sidebar-scroll-wrapper {
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
