<script setup lang="ts">
import { CameraOff, MicOff, VolumeX, ScrollText, Settings, FolderOpen, Minus, X } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import Select from '../../../apps/desktop/src/components/ui/select/Select.vue';
import BrandLogo from '../../../apps/desktop/src/components/brand/BrandLogo.vue';
import KeyboardChip from '../../../apps/desktop/src/components/ui/Kbd/KeyboardChip.vue';
import { useTranslate } from '../../../apps/desktop/src/i18n/useTranslate';
import CaptureModeGroup from '../../../apps/desktop/src/components/hud/CaptureModeGroup.vue';
import HudCaptureCards from '../../../apps/desktop/src/components/hud/HudCaptureCards.vue';
import type { CaptureMode } from '../../../packages/engine/src/capture/capture-mode';
import type { HudCaptureTarget } from '../../../apps/desktop/src/components/hud/hud-state-types';

defineProps<{ mode: CaptureMode; target: HudCaptureTarget }>();
const off = [{ value: 'off', label: 'Off' }];
const { t } = useTranslate('HUD');
</script>

<template>
  <div class="hud-wrapper embedded" style="height: 236px">
    <header class="demo-topbar">
      <BrandLogo title="Beam" />
      <div class="window-actions">
        <Button
          v-for="action in [
            { icon: FolderOpen, label: 'Open project' },
            { icon: Settings, label: 'Preferences' },
            { icon: Minus, label: 'Minimize' },
            { icon: X, label: 'Close' },
          ]"
          :key="action.label"
          :icon="action.icon"
          icon-only
          variant="ghost"
          size="xs"
          :aria-label="action.label"
          :style="{ width: '26px', height: '26px' }"
        />
      </div>
    </header>
    <div class="hud-body">
      <div class="hud-layout">
        <section class="capture-section">
          <CaptureModeGroup :model-value="mode" class="hud-modes" full labels stacked />
          <HudCaptureCards :selected="target" :disabled="false" />
        </section>
        <aside class="hud-devices">
          <template v-if="mode !== 'screenshot'">
            <Select model-value="off" :options="off" label="Camera" size="compact" :icon="CameraOff" />
            <Select model-value="off" :options="off" label="Microphone" size="compact" :icon="MicOff" />
            <Select model-value="off" :options="off" label="System audio" size="compact" :icon="VolumeX" />
            <div class="device-spacer" />
            <Select
              v-if="mode === 'instant'"
              model-value="default"
              :options="[{ value: 'default', label: 'Default' }]"
              label="Preset"
              size="compact"
            />
            <Button v-else variant="secondary" size="sm" block :icon="ScrollText" class="teleprompter-button"
              >Teleprompter</Button
            >
          </template>
          <template v-else>
            <p class="mode-description">{{ t('screenshotDescription') }}</p>
            <div class="device-spacer" />
            <div class="mode-shortcut"><span>Quick Snip</span><KeyboardChip shortcut="Ctrl+Alt+S" /></div>
          </template>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped src="../../../apps/desktop/src/components/hud/hud-shell.css"></style>
<style scoped>
.demo-topbar {
  height: 38px;
  padding: 0 10px 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.window-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
