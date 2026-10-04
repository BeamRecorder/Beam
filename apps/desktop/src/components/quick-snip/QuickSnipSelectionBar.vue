<script setup lang="ts">
import {
  Camera,
  CameraOff,
  Crop,
  GripVertical,
  MicOff,
  Monitor,
  PanelsTopLeft,
  Settings,
  VolumeOff,
  X,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import CaptureModeIcon from '../capture/CaptureModeIcon.vue';
import QuickSnipCaptureIcon from './QuickSnipCaptureIcon.vue';
import Divider from '~/ui/divider/Divider.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import AudioIconMeter from '../hud/audio/AudioIconMeter.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { QuickSnipSelectionState } from './quick-snip-selection-types';
import type { HudCaptureTarget } from '../hud/hud-state-types';
import type { QuickSnipDeviceKind } from '~/api/types/quick-snip';
defineProps<{ state: QuickSnipSelectionState; embedded?: boolean }>();
const emit = defineEmits<{
  'pointer-over': [value: boolean];
  cancel: [];
  'update:displayMode': [value: 'studio' | 'screenshot'];
  'select-source': [target: HudCaptureTarget];
  'device-menu': [kind: QuickSnipDeviceKind, event: MouseEvent];
  'device-keydown': [kind: QuickSnipDeviceKind, event: KeyboardEvent];
  'settings-intent': [];
  'cancel-settings-intent': [];
  'toggle-settings': [event: MouseEvent];
  capture: [];
}>();
const { t } = useTranslate('QuickSnipCropBar');
const { t: hudT } = useTranslate('HUD');
const targets = [
  { id: 'screen', label: 'fullScreen', icon: Monitor },
  { id: 'region', label: 'region', icon: Crop },
  { id: 'window', label: 'window', icon: PanelsTopLeft },
] as const;
</script>
<template>
  <section
    class="crop-bar"
    :class="{ embedded }"
    :aria-label="t('controls')"
    @pointerenter="emit('pointer-over', true)"
    @pointerleave="emit('pointer-over', false)"
  >
    <div class="drag-handle" :title="t('drag')"><GripVertical :size="16" aria-hidden="true" /></div>
    <div class="control-slot">
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="X"
        :title="t('cancel')"
        :aria-label="t('cancel')"
        @click="emit('cancel')"
      />
    </div>
    <ButtonGroup
      size="sm"
      variant="neutral"
      class="control-slot capture-modes"
      :selection="{ index: state.displayMode === 'screenshot' ? 1 : 0, count: 2 }"
      :aria-label="t('mode')"
    >
      <Button
        v-for="choice in ['studio', 'screenshot'] as const"
        :key="choice"
        variant="tab"
        size="sm"
        :class="{ active: state.displayMode === choice }"
        :aria-pressed="state.displayMode === choice"
        :aria-label="t(choice === 'studio' ? 'video' : 'image')"
        :title="t(choice === 'studio' ? 'video' : 'image')"
        :disabled="state.settingsDisabled"
        @click="emit('update:displayMode', choice)"
      >
        <template #icon><CaptureModeIcon :mode="choice" decorative /></template
        >{{ t(choice === 'studio' ? 'video' : 'image') }}
      </Button>
    </ButtonGroup>
    <Divider orientation="vertical" spacing="none" class="control-divider" />
    <ButtonGroup
      size="sm"
      variant="neutral"
      class="control-slot"
      :selection="{ index: targets.findIndex((target) => target.id === state.captureTarget), count: 3 }"
      :aria-label="hudT('chooseCaptureSource')"
    >
      <Button
        v-for="target in targets"
        :key="target.id"
        variant="tab"
        size="sm"
        icon-only
        :style="{ width: '32px', height: '32px', padding: '0' }"
        :icon="target.icon"
        :class="{ active: state.captureTarget === target.id }"
        :aria-pressed="state.captureTarget === target.id"
        :aria-label="hudT(target.label)"
        :title="hudT(target.label)"
        :disabled="state.settingsDisabled"
        @click="emit('select-source', target.id)"
      />
    </ButtonGroup>
    <RafRevealTransition axis="horizontal">
      <div
        v-if="state.mode !== 'screenshot'"
        class="device-controls control-slot"
        role="group"
        :aria-label="t('devices')"
      >
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :aria-label="t('microphone')"
          :aria-pressed="state.microphone"
          :title="t('microphone')"
          :disabled="state.settingsDisabled"
          data-quick-snip-menu-trigger
          @click="emit('device-menu', 'microphone', $event)"
          @contextmenu.stop.prevent="emit('device-menu', 'microphone', $event)"
          @keydown="emit('device-keydown', 'microphone', $event)"
        >
          <template #icon
            ><AudioIconMeter
              v-if="state.microphone"
              kind="mic"
              enabled
              :level="state.microphoneLevel"
              size="sm" /><MicOff v-else :size="18" class="is-off"
          /></template>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :aria-label="t('systemAudio')"
          :aria-pressed="state.systemAudio"
          :title="t('systemAudio')"
          :disabled="state.settingsDisabled"
          data-quick-snip-menu-trigger
          @click="emit('device-menu', 'systemAudio', $event)"
          @contextmenu.stop.prevent="emit('device-menu', 'systemAudio', $event)"
          @keydown="emit('device-keydown', 'systemAudio', $event)"
        >
          <template #icon
            ><AudioIconMeter
              v-if="state.systemAudio"
              kind="system"
              enabled
              :level="state.systemAudioLevel"
              size="sm" /><VolumeOff v-else :size="18" class="is-off"
          /></template>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :aria-label="t('camera')"
          :aria-pressed="state.camera"
          :title="t('camera')"
          :disabled="state.settingsDisabled"
          data-quick-snip-menu-trigger
          @click="emit('device-menu', 'camera', $event)"
          @contextmenu.stop.prevent="emit('device-menu', 'camera', $event)"
          @keydown="emit('device-keydown', 'camera', $event)"
        >
          <template #icon
            ><component :is="state.camera ? Camera : CameraOff" :size="18" :class="{ 'is-off': !state.camera }"
          /></template>
        </Button>
      </div>
    </RafRevealTransition>
    <div class="control-slot">
      <Button
        :variant="state.settingsOpen ? 'selected' : 'ghost'"
        size="sm"
        icon-only
        :icon="Settings"
        :aria-label="t('settings')"
        :title="t('settings')"
        :disabled="state.settingsDisabled"
        :aria-expanded="state.settingsOpen"
        aria-haspopup="dialog"
        data-quick-snip-menu-trigger
        @pointerdown="emit('settings-intent')"
        @pointercancel="emit('cancel-settings-intent')"
        @click="emit('toggle-settings', $event)"
      />
    </div>
    <div class="capture-actions control-slot">
      <Button
        variant="primary"
        size="sm"
        :style="{ width: '40px', height: '40px', fontSize: '18px', borderRadius: 'var(--radius-full)' }"
        icon-only
        :title="state.captureHint"
        :aria-label="state.captureHint"
        :loading="state.preparing || state.actionPending"
        :disabled="!state.configured || state.preparing || state.actionPending || state.deviceMenuBusy"
        @click="emit('capture')"
      >
        <template #icon>
          <QuickSnipCaptureIcon :screenshot="state.mode === 'screenshot'" />
        </template>
      </Button>
    </div>
  </section>
</template>
<style scoped src="./quick-snip-crop-bar.css"></style>
