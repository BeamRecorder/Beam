<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { Check, Move, RotateCcw, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import { capture } from '../../../api/capture';
import type { ScreenRegionOverlayOptions, ScreenRegion } from '../../../api/types/screen-region';
import { useTranslate } from '~/i18n/useTranslate';
import RegionDimensions from './RegionDimensions.vue';
import RegionMagnifier from './RegionMagnifier.vue';
import RegionRecordingToolbar from './RegionRecordingToolbar.vue';
import { regionControlPosition } from './region-overlay-layout';
import type { RegionInteraction, RegionHandle, RegionPointer } from './region-overlay-types';
import type { RegionRecordingSettings } from '../../../api/types/screen-region';
import { SCREEN_REGION_PRESETS, computePresetRegion, findMatchingPreset } from './screen-region-presets';

const { t } = useTranslate('ScreenRegionOverlay');

const options = ref<(ScreenRegionOverlayOptions & { mode?: 'select' | 'record' }) | null>(null);
const region = ref<ScreenRegion | null>(null);
const selectionError = ref('');
let userInteracted = false;
const selectedPreset = ref<string | null>(null);
const presetOptions = computed(() => [{ value: 'fullscreen', label: t('fullScreen') }, ...SCREEN_REGION_PRESETS]);
let interaction: RegionInteraction = null;
const pointer = ref<RegionPointer | null>(null);
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const topControls = ref<HTMLElement | null>(null);
const topSize = ref({ width: 310, height: 36 });
const toolbarSize = ref({ width: 656, height: 56 });
const recording = ref<RegionRecordingSettings | null>(null);
const onResize = () => {
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
};
const topPosition = computed(() =>
  region.value ? regionControlPosition(region.value, viewport.value, topSize.value, 'top') : {},
);
const toolbarPosition = computed(() =>
  region.value ? regionControlPosition(region.value, viewport.value, toolbarSize.value, 'bottom') : {},
);
const pixelBounds = computed(() => ({ ...getEffectiveBounds(), ...options.value?.pixelSize }));
let unsubscribe: (() => void) | null = null;
useResizeObserver(topControls, () => {
  if (pointer.value || !topControls.value) return;
  const { offsetWidth: width, offsetHeight: height } = topControls.value;
  if (width > 0 && height > 0) topSize.value = { width, height };
});

const isSelecting = computed(() => options.value?.mode === 'select');
const regionStyle = computed(() => {
  if (!region.value) return {};
  return {
    left: `${region.value.x * 100}%`,
    top: `${region.value.y * 100}%`,
    width: `${region.value.width * 100}%`,
    height: `${region.value.height * 100}%`,
  };
});

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const point = (event: PointerEvent) => ({
  x: clamp(event.clientX / Math.max(1, window.innerWidth)),
  y: clamp(event.clientY / Math.max(1, window.innerHeight)),
});

const normalize = (x1: number, y1: number, x2: number, y2: number): ScreenRegion => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  width: Math.abs(x2 - x1),
  height: Math.abs(y2 - y1),
});

const isFullScreenRegion = (r: ScreenRegion | null): boolean => {
  if (!r) return false;
  return r.x === 0 && r.y === 0 && r.width === 1 && r.height === 1;
};

const getEffectiveBounds = () =>
  options.value?.bounds || {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };

const persistPreset = async (presetValue: string | null) => {
  try {
    const prefs = await capture.getPreferences();
    await capture.updatePreferences({
      extras: {
        ...prefs.extras,
        screenRegionPreset: presetValue,
      },
    });
  } catch {
    // Ignored if preferences are unavailable
  }
};

const updatePresetMatch = () => {
  if (!region.value) {
    selectedPreset.value = null;
    return;
  }
  const bounds = pixelBounds.value;
  selectedPreset.value = findMatchingPreset(region.value, bounds);
};

const applyPreset = (presetValue: string | number) => {
  userInteracted = true;
  const value = String(presetValue);
  const bounds = pixelBounds.value;
  const nextRegion = computePresetRegion(value, bounds, region.value, isFullScreenRegion(region.value));
  if (nextRegion) {
    region.value = nextRegion;
    selectedPreset.value = value;
    void persistPreset(value);
  }
};

const begin = (event: PointerEvent) => {
  if (!isSelecting.value) return;
  const target = event.target as HTMLElement;
  const handle = target.dataset.handle as RegionHandle | undefined;
  if (event.button !== 0) return;
  userInteracted = true;
  const current = region.value;
  const next = point(event);
  if (handle && current) {
    interaction = { kind: 'resize', handle, startX: next.x, startY: next.y, region: { ...current } };
  } else if (
    current &&
    !isFullScreenRegion(current) &&
    next.x >= current.x &&
    next.x <= current.x + current.width &&
    next.y >= current.y &&
    next.y <= current.y + current.height
  ) {
    interaction = { kind: 'move', startX: next.x, startY: next.y, region: { ...current } };
  } else {
    interaction = { kind: 'draw', startX: next.x, startY: next.y, previous: current ? { ...current } : null };
  }
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};

const move = (event: PointerEvent) => {
  if (!interaction) return;
  const next = point(event);
  if (
    !pointer.value &&
    Math.hypot(
      (next.x - interaction.startX) * viewport.value.width,
      (next.y - interaction.startY) * viewport.value.height,
    ) < 8
  )
    return;
  pointer.value = {
    x: event.clientX,
    y: event.clientY,
    handle: interaction.kind === 'resize' ? interaction.handle : undefined,
  };
  if (interaction.kind === 'draw') {
    region.value = normalize(interaction.startX, interaction.startY, next.x, next.y);
    updatePresetMatch();
    return;
  }
  if (interaction.kind === 'move') {
    const dx = next.x - interaction.startX;
    const dy = next.y - interaction.startY;
    region.value = {
      ...interaction.region,
      x: Math.max(0, Math.min(1 - interaction.region.width, interaction.region.x + dx)),
      y: Math.max(0, Math.min(1 - interaction.region.height, interaction.region.y + dy)),
    };
    return;
  }
  const start = interaction.region;
  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;
  if (interaction.handle.includes('w')) left = Math.min(next.x, right - 0.01);
  if (interaction.handle.includes('e')) right = Math.max(next.x, left + 0.01);
  if (interaction.handle.includes('n')) top = Math.min(next.y, bottom - 0.01);
  if (interaction.handle.includes('s')) bottom = Math.max(next.y, top + 0.01);
  region.value = {
    x: Math.max(0, left),
    y: Math.max(0, top),
    width: Math.min(1, right) - Math.max(0, left),
    height: Math.min(1, bottom) - Math.max(0, top),
  };
  updatePresetMatch();
};

const FULL_SCREEN_REGION: ScreenRegion = { x: 0, y: 0, width: 1, height: 1 };

const end = () => {
  if (interaction?.kind === 'draw' && (!region.value?.width || !region.value.height)) {
    region.value = interaction.previous;
  }
  if (interaction && (interaction.kind === 'draw' || interaction.kind === 'resize')) {
    updatePresetMatch();
  }
  interaction = null;
  pointer.value = null;
};
const reset = () => {
  region.value = { ...FULL_SCREEN_REGION };
  selectedPreset.value = null;
  void persistPreset(null);
};
const confirm = () => {
  if (interaction || !region.value || region.value.width <= 0 || region.value.height <= 0) return;
  if (recording.value) capture.confirmScreenRegion({ ...region.value }, { ...recording.value });
  else capture.confirmScreenRegion({ ...region.value });
};
const cancel = () => {
  if (options.value?.recording) capture.configureCameraOverlay({ cameraId: options.value.recording.cameraId });
  capture.cancelScreenRegion();
};
const handleKeydown = (event: KeyboardEvent) => {
  if (!isSelecting.value || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey)
    return;
  const target = event.target;
  if (target instanceof Element && target.closest('button, input, select, [role="listbox"], [role="option"]')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  } else if (event.key === 'Enter' && region.value && region.value.width > 0 && region.value.height > 0) {
    event.preventDefault();
    confirm();
  }
};

const loadSavedPreset = async () => {
  try {
    const prefs = await capture.getPreferences();
    const saved = prefs.extras?.screenRegionPreset;
    if (userInteracted) return;
    if (typeof saved === 'string' && presetOptions.value.some((p) => p.value === saved)) {
      selectedPreset.value = saved;
      if (!options.value?.region) {
        applyPreset(saved);
      }
    }
  } catch {
    // Ignored if preferences are unavailable
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', onResize);
  unsubscribe = capture.onScreenRegionConfigure((next) => {
    onResize();
    end();
    userInteracted = false;
    selectionError.value = '';
    options.value = next;
    recording.value = next.recording && next.captureMode !== 'screenshot' ? { ...next.recording } : null;
    if (next.region) {
      region.value = { ...next.region };
      updatePresetMatch();
    } else if (selectedPreset.value) {
      applyPreset(selectedPreset.value);
    } else {
      region.value = { ...FULL_SCREEN_REGION };
      updatePresetMatch();
    }
  });
  capture.notifyScreenRegionReady();
  void loadSavedPreset();
});
watch(
  region,
  (next) => {
    if (capture.platform === 'linux' && options.value?.recording && next?.width && next.height)
      void capture
        .updateTeleprompterRegion({ bounds: { ...options.value.bounds }, region: { ...next } })
        .catch((reason) => {
          selectionError.value = String(reason);
        });
    if (options.value?.context === 'quick-snip' && next?.width && next.height) {
      capture.updateScreenRegion({ ...next });
    }
  },
  { deep: true },
);
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', onResize);
  unsubscribe?.();
});
</script>

<template>
  <main
    class="region-overlay"
    :class="{ selecting: isSelecting, recording: !isSelecting }"
    @pointerdown.prevent="begin"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
    @lostpointercapture="end"
    @keydown="handleKeydown"
  >
    <div v-if="isSelecting && !region" class="region-empty-backdrop" />
    <div
      v-if="region"
      class="region-frame"
      :style="regionStyle"
      :class="{ selecting: isSelecting, recording: !isSelecting }"
    >
      <span v-if="isSelecting" class="resize-handle nw" data-handle="nw" />
      <span v-if="isSelecting" class="resize-handle ne" data-handle="ne" />
      <span v-if="isSelecting" class="resize-handle sw" data-handle="sw" />
      <span v-if="isSelecting" class="resize-handle se" data-handle="se" />
    </div>
    <div ref="topControls" v-if="isSelecting && region" class="region-top-controls" :style="topPosition" @pointerdown.stop>
      <RegionDimensions
        :width="Math.round(region.width * pixelBounds.width)"
        :height="Math.round(region.height * pixelBounds.height)"
        :live="Boolean(pointer)"
      />
      <Transition name="region-controls">
        <div v-show="!pointer" class="region-preset-picker">
          <Select
            :model-value="selectedPreset"
            :options="presetOptions"
            :placeholder="t('preset')"
            size="sm"
            @update:model-value="applyPreset"
          />
        </div>
      </Transition>
    </div>
    <RegionMagnifier
      v-if="isSelecting && pointer && options?.preview"
      :image="options.preview"
      :pointer="pointer"
      :viewport="viewport"
    />
    <p v-if="isSelecting && (options?.previewError || selectionError)" class="region-preview-error" role="alert">
      {{ options?.previewError || selectionError }}
    </p>
    <Transition name="region-controls">
      <RegionRecordingToolbar
        v-if="isSelecting && recording"
        v-show="!pointer"
        v-model="recording"
        :style="toolbarPosition"
        :region-options="{ bounds: getEffectiveBounds(), region }"
        :disabled="!region || region.width <= 0 || region.height <= 0"
        @resize="(width, height) => (toolbarSize = { width, height })"
        @record="confirm"
        @cancel="cancel"
      />
    </Transition>
    <Transition name="region-controls">
      <aside v-if="isSelecting && !recording" v-show="!pointer" class="region-toolbar" @pointerdown.stop>
        <span class="region-instruction"><Move :size="16" /> {{ t('instruction') }}</span>
        <div class="region-actions">
          <Button variant="ghost" size="sm" :icon="RotateCcw" @click="reset">{{ t('reset') }}</Button>
          <Button variant="ghost" size="sm" :icon="X" @click="cancel">{{ t('cancel') }}</Button>
          <Button
            variant="primary"
            size="sm"
            :icon="Check"
            :disabled="!region?.width || !region.height"
            @click="confirm"
            >{{ t('useThisArea') }}</Button
          >
        </div>
      </aside>
    </Transition>
  </main>
</template>

<style scoped src="./screen-region-overlay.css"></style>
