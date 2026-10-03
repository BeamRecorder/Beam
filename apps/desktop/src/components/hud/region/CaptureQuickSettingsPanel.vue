<script setup lang="ts">
import { computed } from 'vue';
import Select from '~/ui/select/Select.vue';
import RealCursorPreference from '../settings/RealCursorPreference.vue';
import RecordingDesktopPreferences from '../settings/RecordingDesktopPreferences.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { SelectOption } from '~/ui/select/select-types';
const settings = defineModel<RegionRecordingSettings>({ required: true });
const props = defineProps<{
  showPreset?: boolean;
  screenshot?: boolean;
  presets?: SelectOption[];
  presetId?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ preset: [id: string]; toggle: [open: boolean]; dismiss: [] }>();
const { t } = useTranslate('ScreenRegionOverlay');
const { t: quickT } = useTranslate('QuickSnipCropBar');
const countdownOptions = computed(() =>
  Array.from({ length: 11 }, (_, seconds) => ({
    value: seconds,
    label: seconds === 0 ? t('off') : `${seconds}s`,
  })),
);
const zoomOptions = computed(() => [
  { value: 'off', label: t('off') },
  { value: '2d', label: '2D' },
  { value: '3d', label: '3D' },
]);
</script>
<template>
  <div
    class="capture-quick-settings"
    @pointerdown.stop
    @keydown.stop="if ($event.key === 'Escape' && !$event.defaultPrevented) emit('dismiss');"
  >
    <label v-if="showPreset" class="option-row">
      <span>{{ quickT('preset') }}</span>
      <Select
        :model-value="presetId ?? 'default'"
        :options="presets"
        size="compact"
        :option-height="28"
        :label="quickT('preset')"
        :disabled="disabled"
        @update:model-value="emit('preset', String($event))"
        @toggle="emit('toggle', $event)"
      />
    </label>
    <label class="option-row">
      <span>{{ t('countdown') }}</span>
      <Select
        :model-value="settings.countdownSeconds"
        :options="countdownOptions"
        size="compact"
        :option-height="28"
        :label="t('countdown')"
        :disabled="disabled"
        @update:model-value="settings = { ...settings, countdownSeconds: Number($event) }"
        @toggle="emit('toggle', $event)"
      />
    </label>
    <label v-if="!screenshot" class="option-row">
      <span>{{ quickT('zoom') }}</span>
      <Select
        :model-value="settings.zoomMode ?? '2d'"
        :options="zoomOptions"
        size="compact"
        :option-height="28"
        :label="quickT('zoom')"
        :disabled="disabled"
        @update:model-value="settings = { ...settings, zoomMode: $event as 'off' | '2d' | '3d' }"
        @toggle="emit('toggle', $event)"
      />
    </label>
    <RealCursorPreference
      v-if="!screenshot"
      :model-value="settings.showRealCursor"
      @update:model-value="settings = { ...settings, showRealCursor: $event }"
    />
    <RecordingDesktopPreferences
      :hide-taskbar="settings.hideTaskbar"
      :hide-desktop-icons="settings.hideDesktopIcons"
      @update:hide-taskbar="settings = { ...settings, hideTaskbar: $event }"
      @update:hide-desktop-icons="settings = { ...settings, hideDesktopIcons: $event }"
    />
  </div>
</template>
<style scoped>
.capture-quick-settings {
  display: grid;
  gap: 14px;
  width: 264px;
  min-width: 0;
  max-width: 100%;
  padding: 12px;
  box-sizing: border-box;
}
.option-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
  color: var(--text-primary);
  font: var(--weight-body) var(--font-size-sm) var(--font-sans);
}
.option-row > span {
  overflow-wrap: anywhere;
}
</style>
