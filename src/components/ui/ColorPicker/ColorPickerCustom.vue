<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Pipette, ArrowUpDown, X } from '@lucide/vue';
import { drawColorTriangle, TRI_RADIUS, CANVAS_SIZE } from './color-picker-canvas';
import { readPickerPoint } from './color-picker-geometry';
import type { DragTarget } from './color-picker-types';
import { useColorPicker, type RGB } from './composables/useColorPicker';
import Input from '../input/Input.vue';
import Button from '../button/Button.vue';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    flat?: boolean;
    hideHeader?: boolean;
    eyedropperLabel?: string;
    formatLabel?: string;
    type?: 'standard' | 'triangle';
    alphaValue?: number;
    showAlpha?: boolean;
  }>(),
  {
    type: 'triangle',
    alphaValue: 1,
    showAlpha: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:alpha', value: number): void;
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
  (e: 'close'): void;
}>();

const { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb } = useColorPicker();

const h = ref(0);
const s = ref(0);
const v = ref(0);
const a = ref(1);
const inputMode = ref(0); // 0: HEX, 1: RGB

const triangleCanvas = ref<HTMLCanvasElement | null>(null);
const interactionLayer = ref<HTMLDivElement | null>(null);
const svArea = ref<HTMLElement | null>(null);
const hueSlider = ref<HTMLElement | null>(null);
const alphaSlider = ref<HTMLElement | null>(null);

const RING_OUTER = 76;
const RING_INNER = 64;

watch(
  () => props.modelValue,
  (newVal) => {
    if (!newVal) return;
    const hsvNow = hsvToRgb(h.value, s.value, v.value);
    const currentHex = rgbToHex(hsvNow.r, hsvNow.g, hsvNow.b).toLowerCase();

    if (newVal.toLowerCase() !== currentHex) {
      const rgbVal = hexToRgb(newVal);
      const hsvVal = rgbToHsv(rgbVal.r, rgbVal.g, rgbVal.b);
      h.value = hsvVal.h;
      s.value = hsvVal.s;
      v.value = hsvVal.v;
      if (props.type === 'triangle') renderTriangle();
    }
  },
  { immediate: true },
);
watch(
  () => props.alphaValue,
  (newVal) => {
    const n = Number(newVal);
    if (!Number.isFinite(n)) return;
    a.value = Math.max(0, Math.min(1, n));
  },
  { immediate: true },
);

const rgb = computed(() => hsvToRgb(h.value, s.value, v.value));
const hex = computed(() => rgbToHex(rgb.value.r, rgb.value.g, rgb.value.b));
const pureHueColor = computed(() => {
  const rVal = hsvToRgb(h.value, 100, 100);
  return rgbToHex(rVal.r, rVal.g, rVal.b);
});
function renderTriangle() {
  if (triangleCanvas.value) drawColorTriangle(triangleCanvas.value, pureHueColor.value);
}

let currentDragTarget: DragTarget = null;
const activeDragTarget = ref<DragTarget>(null);
function setDragTarget(target: DragTarget): void {
  currentDragTarget = target;
  activeDragTarget.value = target;
}
function handleTriangleRingUpdate(e: MouseEvent | TouchEvent) {
  const point = readPickerPoint(e, interactionLayer.value);
  if (!point) return;
  const x = point.x - point.width / 2;
  const y = point.y - point.height / 2;

  if (currentDragTarget === 'ring') {
    const angle = Math.atan2(y, x);
    let deg = (angle * 180) / Math.PI;
    if (deg < 0) deg += 360;
    h.value = deg;
  } else if (currentDragTarget === 'triangle') {
    const R = TRI_RADIUS;
    const h_tri = (R * 3) / 2;
    const s_raw = (x + R / 2) / h_tri;
    const s_val = Math.max(0, Math.min(1, s_raw));
    const currentHalfHeight = ((1 - s_val) * (R * Math.sqrt(3))) / 2;

    let v_val = 1;
    if (currentHalfHeight > 0.01) {
      const y_norm = (y + currentHalfHeight) / (currentHalfHeight * 2);
      v_val = 1 - Math.max(0, Math.min(1, y_norm));
    }

    s.value = s_val * 100;
    v.value = v_val * 100;
  }
  emit('update:modelValue', hex.value);
}
function handleStandardSVUpdate(e: MouseEvent | TouchEvent) {
  const point = readPickerPoint(e, svArea.value);
  if (!point) return;
  s.value = Math.max(0, Math.min(1, point.x / point.width)) * 100;
  v.value = (1 - Math.max(0, Math.min(1, point.y / point.height))) * 100;
  emit('update:modelValue', hex.value);
}
function handleStandardHueUpdate(e: MouseEvent | TouchEvent) {
  const point = readPickerPoint(e, hueSlider.value);
  if (!point) return;
  h.value = Math.max(0, Math.min(1, point.y / point.height)) * 360;
  emit('update:modelValue', hex.value);
}
function handleStandardAlphaUpdate(e: MouseEvent | TouchEvent) {
  const point = readPickerPoint(e, alphaSlider.value);
  if (!point) return;
  a.value = 1 - Math.max(0, Math.min(1, point.y / point.height));
  emit('update:alpha', a.value);
}
function startInteraction() {
  beginPropertyInteraction();
  emit('drag-start');
}
function beginTriangleDrag(e: MouseEvent | TouchEvent): boolean {
  const point = readPickerPoint(e, interactionLayer.value);
  if (!point) return false;
  const distance = Math.hypot(point.x - point.width / 2, point.y - point.height / 2);
  setDragTarget(distance >= RING_INNER - 6 ? 'ring' : 'triangle');
  startInteraction();
  handleTriangleRingUpdate(e);
  return true;
}
function onMouseDownTri(e: MouseEvent) {
  if (!beginTriangleDrag(e)) return;
  window.addEventListener('mousemove', onGlobalMouseMove);
  window.addEventListener('mouseup', onGlobalMouseUp);
}
function onTouchStartTri(e: TouchEvent) {
  if (!beginTriangleDrag(e)) return;
  window.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
  window.addEventListener('touchend', onGlobalTouchEnd);
  window.addEventListener('touchcancel', onGlobalTouchEnd);
}
function onMouseDownSV(e: MouseEvent) {
  setDragTarget('standard-sv');
  startInteraction();
  handleStandardSVUpdate(e);
  window.addEventListener('mousemove', onGlobalMouseMove);
  window.addEventListener('mouseup', onGlobalMouseUp);
}
function onTouchStartSV(e: TouchEvent) {
  setDragTarget('standard-sv');
  startInteraction();
  handleStandardSVUpdate(e);
  window.addEventListener('touchmove', onGlobalTouchMove, {
    passive: false,
  });
  window.addEventListener('touchend', onGlobalTouchEnd);
  window.addEventListener('touchcancel', onGlobalTouchEnd);
}
function onMouseDownHue(e: MouseEvent) {
  setDragTarget('standard-hue');
  startInteraction();
  handleStandardHueUpdate(e);
  window.addEventListener('mousemove', onGlobalMouseMove);
  window.addEventListener('mouseup', onGlobalMouseUp);
}
function onTouchStartHue(e: TouchEvent) {
  setDragTarget('standard-hue');
  startInteraction();
  handleStandardHueUpdate(e);
  window.addEventListener('touchmove', onGlobalTouchMove, {
    passive: false,
  });
  window.addEventListener('touchend', onGlobalTouchEnd);
  window.addEventListener('touchcancel', onGlobalTouchEnd);
}
function onMouseDownAlpha(e: MouseEvent) {
  setDragTarget('standard-alpha');
  startInteraction();
  handleStandardAlphaUpdate(e);
  window.addEventListener('mousemove', onGlobalMouseMove);
  window.addEventListener('mouseup', onGlobalMouseUp);
}
function onTouchStartAlpha(e: TouchEvent) {
  setDragTarget('standard-alpha');
  startInteraction();
  handleStandardAlphaUpdate(e);
  window.addEventListener('touchmove', onGlobalTouchMove, {
    passive: false,
  });
  window.addEventListener('touchend', onGlobalTouchEnd);
  window.addEventListener('touchcancel', onGlobalTouchEnd);
}
function onGlobalMouseMove(e: MouseEvent) {
  if (currentDragTarget === 'ring' || currentDragTarget === 'triangle') {
    handleTriangleRingUpdate(e);
  } else if (currentDragTarget === 'standard-sv') {
    handleStandardSVUpdate(e);
  } else if (currentDragTarget === 'standard-hue') {
    handleStandardHueUpdate(e);
  } else if (currentDragTarget === 'standard-alpha') {
    handleStandardAlphaUpdate(e);
  }
}
function onGlobalMouseUp() {
  const wasDragging = currentDragTarget !== null;
  setDragTarget(null);
  window.removeEventListener('mousemove', onGlobalMouseMove);
  window.removeEventListener('mouseup', onGlobalMouseUp);
  if (wasDragging) {
    endPropertyInteraction();
    emit('drag-end');
  }
}
function onGlobalTouchMove(e: TouchEvent) {
  e.preventDefault();
  if (currentDragTarget === 'ring' || currentDragTarget === 'triangle') {
    handleTriangleRingUpdate(e);
  } else if (currentDragTarget === 'standard-sv') {
    handleStandardSVUpdate(e);
  } else if (currentDragTarget === 'standard-hue') {
    handleStandardHueUpdate(e);
  } else if (currentDragTarget === 'standard-alpha') {
    handleStandardAlphaUpdate(e);
  }
}
function onGlobalTouchEnd() {
  const wasDragging = currentDragTarget !== null;
  setDragTarget(null);
  window.removeEventListener('touchmove', onGlobalTouchMove);
  window.removeEventListener('touchend', onGlobalTouchEnd);
  window.removeEventListener('touchcancel', onGlobalTouchEnd);
  if (wasDragging) {
    endPropertyInteraction();
    emit('drag-end');
  }
}

const isMobileViewport = ref(false);
function updateIsMobileViewport() {
  isMobileViewport.value = window.innerWidth <= 480;
}

onMounted(() => {
  if (props.type === 'triangle') nextTick(renderTriangle);
  updateIsMobileViewport();
  window.addEventListener('resize', updateIsMobileViewport, {
    passive: true,
  });
});
watch(
  () => h.value,
  () => {
    if (props.type === 'triangle') renderTriangle();
  },
);
onUnmounted(() => {
  onGlobalMouseUp();
  onGlobalTouchEnd();
  window.removeEventListener('resize', updateIsMobileViewport);
});

const hasEyeDropper = ref(typeof window !== 'undefined' && 'EyeDropper' in window);

async function openEyeDropper() {
  if (!hasEyeDropper.value) return;
  try {
    const eyeDropper = new (window as any).EyeDropper();
    const result = await eyeDropper.open();
    emit('update:modelValue', result.sRGBHex);
  } catch (e) {
    /* silent */
  }
}
function updateChannel(channel: keyof RGB, val: string | number) {
  const n = Math.max(0, Math.min(255, Number(val) || 0));
  const nextRgb = { ...rgb.value, [channel]: n };
  emit('update:modelValue', rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
}

const triangleCursorStyle = computed(() => {
  const R = TRI_RADIUS;
  const h_tri = (R * 3) / 2;
  const x = -R / 2 + (s.value / 100) * h_tri;
  const currentHalfHeight = ((1 - s.value / 100) * (R * Math.sqrt(3))) / 2;
  const y = (1 - v.value / 100) * (currentHalfHeight * 2) - currentHalfHeight;
  return { transform: `translate(${x}px, ${y}px)` };
});

const hueRingIndicatorStyle = computed(() => {
  const rad = (h.value * Math.PI) / 180;
  const r = (RING_INNER + RING_OUTER) / 2;
  return {
    transform: `translate(${Math.cos(rad) * r}px, ${Math.sin(rad) * r}px) rotate(${h.value}deg)`,
  };
});

const isDraggingMobile = computed(() => !!activeDragTarget.value && isMobileViewport.value);
</script>

<template>
  <div
    class="custom-color-picker"
    :class="{
      'custom-color-picker--standard': type === 'standard',
      'custom-color-picker--triangle': type === 'triangle',
      'custom-color-picker--dragging': isDraggingMobile,
      [`custom-color-picker--dragging-${activeDragTarget}`]: activeDragTarget,
    }"
  >
    <div v-if="!hideHeader" class="picker-top-bar">
      <span class="picker-top-title">Color</span>
      <Button variant="ghost" size="xs" icon-only tooltip="Close" @click="emit('close')">
        <X :size="14" />
      </Button>
    </div>
    <div class="picker-main-area">
      <template v-if="type === 'triangle'">
        <div
          class="triangle-picker-container"
          @mousedown.prevent="onMouseDownTri"
          @touchstart.stop.prevent="onTouchStartTri"
        >
          <div
            class="hue-wheel"
            :style="{
              width: RING_OUTER * 2 + 'px',
              height: RING_OUTER * 2 + 'px',
            }"
          >
            <div
              class="hue-wheel-inner"
              :style="{
                width: RING_INNER * 2 + 'px',
                height: RING_INNER * 2 + 'px',
              }"
            ></div>
          </div>
          <canvas ref="triangleCanvas" class="triangle-canvas" :width="CANVAS_SIZE" :height="CANVAS_SIZE"></canvas>
          <div ref="interactionLayer" class="interaction-layer">
            <div class="hue-indicator" :style="hueRingIndicatorStyle"></div>
            <div class="triangle-cursor" :style="triangleCursorStyle"></div>
          </div>
        </div>
      </template>
      <template v-else>
        <div
          ref="svArea"
          class="sv-container"
          @mousedown.prevent="onMouseDownSV"
          @touchstart.stop.prevent="onTouchStartSV"
        >
          <div class="sv-color-layer" :style="{ backgroundColor: pureHueColor }"></div>
          <div class="sv-white"></div>
          <div class="sv-black"></div>
          <div class="sv-cursor" :style="{ left: `${s}%`, top: `${100 - v}%` }"></div>
        </div>
        <div
          ref="hueSlider"
          class="hue-slider-vertical"
          @mousedown.prevent="onMouseDownHue"
          @touchstart.stop.prevent="onTouchStartHue"
        >
          <div class="hue-cursor-vertical" :style="{ top: `${(h / 360) * 100}%` }"></div>
        </div>
        <div
          v-if="showAlpha"
          ref="alphaSlider"
          class="alpha-slider-vertical"
          :style="{ '--alpha-color': hex }"
          @mousedown.prevent="onMouseDownAlpha"
          @touchstart.stop.prevent="onTouchStartAlpha"
        >
          <div class="alpha-cursor-vertical" :style="{ top: `${(1 - a) * 100}%` }"></div>
        </div>
      </template>
    </div>

    <div class="controls-container">
      <div class="previews-row">
        <div class="color-preview-large" :style="{ backgroundColor: hex }"></div>
        <Button
          variant="secondary"
          @click="openEyeDropper"
          v-if="hasEyeDropper"
          class="eyedropper-btn"
          :aria-label="eyedropperLabel"
        >
          <Pipette :size="14" />
        </Button>
      </div>

      <div class="inputs-row">
        <div class="inputs-group">
          <template v-if="inputMode === 1">
            <div class="channel-input-wrapper">
              <Input
                type="number"
                :model-value="rgb.r"
                @update:model-value="updateChannel('r', $event)"
                :min="0"
                :max="255"
                size="sm"
              />
              <span class="channel-label">R</span>
            </div>
            <div class="channel-input-wrapper">
              <Input
                type="number"
                :model-value="rgb.g"
                @update:model-value="updateChannel('g', $event)"
                :min="0"
                :max="255"
                size="sm"
              />
              <span class="channel-label">G</span>
            </div>
            <div class="channel-input-wrapper">
              <Input
                type="number"
                :model-value="rgb.b"
                @update:model-value="updateChannel('b', $event)"
                :min="0"
                :max="255"
                size="sm"
              />
              <span class="channel-label">B</span>
            </div>
          </template>
          <template v-else>
            <div class="channel-input-wrapper hex-wrapper">
              <Input
                type="text"
                size="sm"
                :model-value="hex.toUpperCase()"
                @update:model-value="emit('update:modelValue', $event as string)"
              />
              <span class="channel-label">HEX</span>
            </div>
          </template>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon-only
          @click="inputMode = (inputMode + 1) % 2"
          class="mode-switch-btn"
          :aria-label="formatLabel"
        >
          <ArrowUpDown :size="14" />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ColorPickerCustom.css"></style>
