<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { Image, SlidersHorizontal, Upload, Video } from '@lucide/vue';
import AddTileButton from '~/ui/button/AddTileButton.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Popover from '~/ui/popover/Popover.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import BackgroundPresetComposer from './BackgroundPresetComposer.vue';
import RemoveBackgroundControl from './RemoveBackgroundControl.vue';
import { capture } from '../../../../api/capture';
import {
  customColor,
  customGradient,
  gradientCssBackground,
  type BackgroundMedia,
  type BackgroundMediaGroup,
  type BackgroundValue,
} from '../../composables/backgroundCatalog';
import { useBackgroundPreviews } from './useBackgroundPreviews';
import { useBackgroundPresets } from './useBackgroundPresets';
import { useTranslate } from '~/i18n/useTranslate';
import type { WatermarkSettings } from '../../canvas/output-canvas';
import WatermarkControls from './WatermarkControls.vue';

const { t } = useTranslate('CanvasPanel');

const props = defineProps<{
  selectedBackground: BackgroundValue | null;
  backgroundGroups: BackgroundMediaGroup[];
  projectId?: string | null;
  blurPercent: number;
  showBackground: boolean;
  watermark?: WatermarkSettings;
}>();

const emit = defineEmits<{
  (e: 'update:selectedBackground', value: BackgroundValue): void;
  (e: 'update:blurPercent', value: number): void;
  (e: 'update:showBackground', value: boolean): void;
  (e: 'update:watermark', value: WatermarkSettings): void;
  (e: 'import:background', value: BackgroundMedia): void;
}>();

const activeKind = ref<'image' | 'video' | 'color' | 'gradient'>('image');
const INITIAL_MEDIA_COUNT = 15;
const LOAD_MORE_FRAME_SIZE = 3;
const visibleCount = ref(INITIAL_MEDIA_COUNT);
const isLoadingMore = ref(false);

const blurDraft = ref(props.blurPercent);
watch(
  () => props.blurPercent,
  (val) => {
    blurDraft.value = val;
  },
);
const handleBlurUpdate = (val: number) => {
  blurDraft.value = val;
  emit('update:blurPercent', val);
};

const gridRef = ref<HTMLElement | null>(null);
const tileElements = new Map<string, Element>();
const tileItems = new Map<string, BackgroundMedia>();
const tileItemsByElement = new Map<Element, BackgroundMedia>();
const tileRefHandlers = new Map<string, (element: Element | ComponentPublicInstance | null) => void>();
let previewObserver: IntersectionObserver | null = null;
let observationFrame: number | null = null;
let loadMoreFrame: number | null = null;
let loadMoreTarget = 0;
const { previews, failed, request: requestPreview } = useBackgroundPreviews();

const {
  colorPresets,
  gradientPresets,
  customColorValue,
  customGradientValue,
  editingPresetId,
  toggleColor,
  toggleGradient,
  beginAdd,
  isEditing,
  close: closeCustomEditor,
  saveColor: addColorPreset,
  saveGradient: addGradientPreset,
  updateLiveColor,
  updateLiveGradient,
} = useBackgroundPresets((value) => emit('update:selectedBackground', value));

const items = computed(() => props.backgroundGroups.find((group) => group.kind === activeKind.value)?.items ?? []);

const visibleItems = computed(() => items.value.slice(0, visibleCount.value));

const hasMore = computed(() => visibleCount.value < items.value.length);

const updateMediaTileElement = (element: Element | ComponentPublicInstance | null, item: BackgroundMedia) => {
  const domElement = element && '$el' in element ? (element.$el as Element | null) : (element as Element | null);
  const previous = tileElements.get(item.id);
  if (previous === domElement) return;
  if (previous) {
    previewObserver?.unobserve(previous);
    tileItemsByElement.delete(previous);
  }
  if (!domElement) {
    tileElements.delete(item.id);
    return;
  }
  tileElements.set(item.id, domElement);
  tileItemsByElement.set(domElement, item);
  previewObserver?.observe(domElement);
};

const mediaTileRef = (item: BackgroundMedia) => {
  tileItems.set(item.id, item);
  const existing = tileRefHandlers.get(item.id);
  if (existing) return existing;
  const handler = (element: Element | ComponentPublicInstance | null) => {
    const currentItem = tileItems.get(item.id);
    if (currentItem) updateMediaTileElement(element, currentItem);
  };
  tileRefHandlers.set(item.id, handler);
  return handler;
};

const observeVisibleTiles = () => {
  for (const item of visibleItems.value) {
    const element = tileElements.get(item.id);
    if (element) previewObserver?.observe(element);
  }
};

const scheduleVisibleTileObservation = () => {
  if (observationFrame !== null) return;
  observationFrame = requestAnimationFrame(() => {
    observationFrame = null;
    void nextTick(observeVisibleTiles);
  });
};

const cancelLoadMore = () => {
  if (loadMoreFrame !== null) cancelAnimationFrame(loadMoreFrame);
  loadMoreFrame = null;
  loadMoreTarget = 0;
  isLoadingMore.value = false;
};

const loadMoreFrameStep = () => {
  loadMoreFrame = null;
  const target = Math.min(loadMoreTarget, items.value.length);
  visibleCount.value = Math.min(visibleCount.value + LOAD_MORE_FRAME_SIZE, target);
  if (visibleCount.value < target) {
    loadMoreFrame = requestAnimationFrame(loadMoreFrameStep);
    return;
  }
  loadMoreTarget = 0;
  isLoadingMore.value = false;
};

// Instant tab switch
const switchKind = (kind: 'image' | 'video' | 'color' | 'gradient') => {
  if (activeKind.value === kind) return;

  cancelLoadMore();
  activeKind.value = kind;
  closeCustomEditor();

  if (gridRef.value) {
    gridRef.value.scrollTop = 0;
  }
};

const loadMore = () => {
  if (isLoadingMore.value || !hasMore.value) return;
  isLoadingMore.value = true;
  loadMoreTarget = Math.min(items.value.length, visibleCount.value + INITIAL_MEDIA_COUNT);
  loadMoreFrame = requestAnimationFrame(loadMoreFrameStep);
};

const selectMediaBackground = (item: BackgroundMedia) => {
  emit('update:selectedBackground', item);
};

const isSelected = (entry: BackgroundValue) => props.selectedBackground?.id === entry.id;
const selectedColorPreset = computed(() => colorPresets.value.find((item) => isSelected(item)) ?? null);
const selectedGradientPreset = computed(() => gradientPresets.value.find((item) => isSelected(item)) ?? null);

const triggerImport = async () => {
  const kind = activeKind.value === 'image' || activeKind.value === 'video' ? activeKind.value : 'media';
  const background = await capture.pickBackgroundLibraryMedia(kind);
  if (background) {
    emit('import:background', background);
  }
};

const importLabel = computed(() =>
  activeKind.value === 'image'
    ? t('importCustomImage')
    : activeKind.value === 'video'
      ? t('importCustomVideo')
      : t('importCustomBackground'),
);

onMounted(() => {
  previewObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const item = tileItemsByElement.get(entry.target);
        if (item) requestPreview(item);
      }
    },
    { root: null, rootMargin: '120px', threshold: 0.01 },
  );
  scheduleVisibleTileObservation();
});

onUnmounted(() => {
  cancelLoadMore();
  if (observationFrame !== null) cancelAnimationFrame(observationFrame);
  previewObserver?.disconnect();
  tileElements.clear();
  tileItems.clear();
  tileItemsByElement.clear();
  tileRefHandlers.clear();
});
</script>

<template>
  <div class="canvas-panel-container">
    <!-- ButtonGroup Tabs Navigation -->
    <ButtonGroup :aria-label="t('backgroundType')" class="kind-group">
      <Button
        size="xs"
        :variant="activeKind === 'image' ? 'primary' : 'ghost'"
        :icon="Image"
        @click="switchKind('image')"
      >
        {{ t('image') }}
      </Button>
      <Button
        size="xs"
        :variant="activeKind === 'video' ? 'primary' : 'ghost'"
        :icon="Video"
        @click="switchKind('video')"
      >
        {{ t('video') }}
      </Button>
      <Button size="xs" :variant="activeKind === 'color' ? 'primary' : 'ghost'" @click="switchKind('color')">
        {{ t('color') }}
      </Button>
      <Button size="xs" :variant="activeKind === 'gradient' ? 'primary' : 'ghost'" @click="switchKind('gradient')">
        {{ t('gradient') }}
      </Button>
    </ButtonGroup>

    <!-- Custom Background Import Button -->
    <Button variant="secondary" size="sm" block :icon="Upload" class="import-btn" @click="triggerImport">
      {{ importLabel }}
    </Button>

    <!-- Hardware-Accelerated Tab Content Container -->
    <div class="tab-content-panel">
      <!-- Image & Video Media Grid -->
      <div v-show="activeKind === 'image' || activeKind === 'video'" ref="gridRef" class="media-scroll-grid">
        <div v-if="!items.length" class="empty-backgrounds">
          <span>{{ t('noBackgroundFound') }}</span>
          <Button variant="secondary" size="sm" block :icon="Upload" @click="triggerImport">
            {{ importLabel }}
          </Button>
        </div>
        <button
          v-for="item in visibleItems"
          :key="item.id"
          type="button"
          class="media-tile"
          :ref="mediaTileRef(item)"
          :class="{
            active: isSelected(item),
          }"
          :aria-label="item.name"
          :aria-busy="!previews[item.id] && !failed[item.id]"
          draggable="false"
          @dragstart.prevent
          @click="selectMediaBackground(item)"
        >
          <img
            v-if="previews[item.id]"
            :src="previews[item.id]"
            :alt="item.name"
            class="media-content loaded"
            loading="lazy"
            decoding="async"
            draggable="false"
            @dragstart.prevent
          />
          <img
            v-else-if="item.kind === 'image' && failed[item.id]"
            :src="item.path"
            :alt="item.name"
            class="media-content loaded"
            loading="lazy"
            decoding="async"
            draggable="false"
            @dragstart.prevent
          />
          <span v-else-if="item.kind === 'video' && failed[item.id]" class="video-placeholder">
            <Video :size="16" />
          </span>
          <Skeleton v-else class="media-loading-skeleton" width="100%" height="100%" radius="inherit" />
        </button>
        <div v-if="hasMore" class="load-more">
          <Button variant="secondary" size="sm" block :disabled="isLoadingMore" @click="loadMore">
            {{ t('showMore') }}
          </Button>
        </div>
      </div>

      <!-- Color Swatches Grid -->
      <div v-show="activeKind === 'color'" class="swatches-section">
        <div class="swatches-grid">
          <Popover
            block
            :match-trigger-width="false"
            flush
            @toggle="
              (open) => {
                if (!open) closeCustomEditor();
              }
            "
          >
            <template #trigger>
              <AddTileButton
                :active="isSelected(customColor(customColorValue))"
                :label="t('customColor')"
                @click="beginAdd('color')"
              />
            </template>
            <template #default="{ close }">
              <BackgroundPresetComposer
                kind="color"
                :color="customColorValue"
                :gradient="customGradientValue"
                @add-color="
                  (val) => {
                    addColorPreset(val);
                    close();
                  }
                "
                @update-color="updateLiveColor"
                @close="
                  () => {
                    closeCustomEditor();
                    close();
                  }
                "
              />
            </template>
          </Popover>
          <button
            v-for="item in colorPresets"
            :key="item.id"
            type="button"
            class="swatch-tile"
            :class="{ active: isSelected(item), editing: isEditing(item.id) }"
            :style="{ background: item.color }"
            :aria-label="item.name"
            @click="emit('update:selectedBackground', item)"
          />
        </div>
        <Popover
          v-if="selectedColorPreset"
          block
          :match-trigger-width="false"
          flush
          @toggle="
            (open) => {
              if (!open) closeCustomEditor();
            }
          "
        >
          <template #trigger>
            <Button
              variant="secondary"
              size="sm"
              block
              :icon="SlidersHorizontal"
              :aria-pressed="isEditing(selectedColorPreset.id)"
              class="edit-selected-preset"
              @click="toggleColor(selectedColorPreset)"
              >{{ isEditing(selectedColorPreset.id) ? t('closeEditing') : t('edit') }}</Button
            >
          </template>
          <template #default="{ close }">
            <BackgroundPresetComposer
              kind="color"
              :color="selectedColorPreset?.color ?? customColorValue"
              :gradient="selectedGradientPreset?.gradient ?? customGradientValue"
              @add-color="
                (val) => {
                  addColorPreset(val);
                  close();
                }
              "
              @update-color="updateLiveColor"
              @close="
                () => {
                  closeCustomEditor();
                  close();
                }
              "
            />
          </template>
        </Popover>
      </div>

      <!-- Gradient Presets Grid -->
      <div v-show="activeKind === 'gradient'" class="gradients-section">
        <div class="gradients-grid">
          <Popover
            block
            :match-trigger-width="false"
            flush
            @toggle="
              (open) => {
                if (!open) closeCustomEditor();
              }
            "
          >
            <template #trigger>
              <AddTileButton
                :active="isSelected(customGradient(customGradientValue))"
                :label="t('customGradient')"
                @click="beginAdd('gradient')"
              />
            </template>
            <template #default="{ close }">
              <BackgroundPresetComposer
                kind="gradient"
                :color="customColorValue"
                :gradient="customGradientValue"
                @add-gradient="
                  (val) => {
                    addGradientPreset(val);
                    close();
                  }
                "
                @update-gradient="updateLiveGradient"
                @close="
                  () => {
                    closeCustomEditor();
                    close();
                  }
                "
              />
            </template>
          </Popover>
          <button
            v-for="item in gradientPresets"
            :key="item.id"
            type="button"
            class="swatch-tile"
            :class="{ active: isSelected(item), editing: isEditing(item.id) }"
            :style="{
              background: gradientCssBackground(item.gradient),
            }"
            :aria-label="item.name"
            @click="emit('update:selectedBackground', item)"
          />
        </div>
        <Popover
          v-if="selectedGradientPreset"
          block
          :match-trigger-width="false"
          flush
          @toggle="
            (open) => {
              if (!open) closeCustomEditor();
            }
          "
        >
          <template #trigger>
            <Button
              variant="secondary"
              size="sm"
              block
              :icon="SlidersHorizontal"
              :aria-pressed="isEditing(selectedGradientPreset.id)"
              class="edit-selected-preset"
              @click="toggleGradient(selectedGradientPreset)"
              >{{ isEditing(selectedGradientPreset.id) ? t('closeEditing') : t('edit') }}</Button
            >
          </template>
          <template #default="{ close }">
            <BackgroundPresetComposer
              kind="gradient"
              :color="selectedColorPreset?.color ?? customColorValue"
              :gradient="selectedGradientPreset?.gradient ?? customGradientValue"
              @add-gradient="
                (val) => {
                  addGradientPreset(val);
                  close();
                }
              "
              @update-gradient="updateLiveGradient"
              @close="
                () => {
                  closeCustomEditor();
                  close();
                }
              "
            />
          </template>
        </Popover>
      </div>
    </div>

    <!-- Blur Slider -->
    <div class="slider-row">
      <BigSlider
        :model-value="blurDraft"
        :min="0"
        :max="100"
        :step="1"
        :label="t('blur')"
        :format-value="(value: number) => `${Math.round(value)}%`"
        @update:model-value="handleBlurUpdate"
        @interaction-end="emit('update:blurPercent', blurDraft)"
      />
    </div>

    <RemoveBackgroundControl
      :model-value="!showBackground"
      @update:model-value="emit('update:showBackground', !$event)"
    />

    <WatermarkControls :model-value="watermark" @update:model-value="emit('update:watermark', $event)" />
  </div>
</template>

<style scoped>
.canvas-panel-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.kind-group {
  width: 100%;
  display: flex;
}

.kind-group :deep(.btn-container) {
  flex: 1;
  min-width: 0;
}

.kind-group :deep(.btn) {
  padding-left: 2px;
  padding-right: 2px;
}

.import-btn {
  width: 100%;
}

/* Content Panel */
.tab-content-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

/* Three compact rows are enough for quick selection. More media is explicit. */
.media-scroll-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
  background: var(--color-bg-surface, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md);
  contain: layout style paint;
}

/* Media Tile Element with Dashed Hover Border */
.media-tile {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: var(--color-bg-element, rgba(255, 255, 255, 0.06));
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
  user-select: none;
  -webkit-user-drag: none;
  transition:
    border-color var(--fast) ease,
    box-shadow var(--fast) ease;
  contain: strict;
}

.media-loading-skeleton {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.media-tile:hover:not(.active) {
  border: 1px dashed var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary-light);
}

.media-tile.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.media-content {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: inherit;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

img.media-content {
  opacity: 1;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #9ca3af);
  background: rgba(0, 0, 0, 0.3);
  border-radius: inherit;
}

.load-more {
  grid-column: 1 / -1;
  justify-self: stretch;
  width: 100%;
}

.empty-backgrounds {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 12px;
  color: var(--text-secondary, #9ca3af);
  font-size: 12px;
  text-align: center;
}

/* Color & Gradient Swatches Grid */
.swatches-section,
.gradients-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.swatches-grid,
.gradients-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 7px;
}

.swatch-tile {
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border-radius: 10px;
  border: 1.5px solid var(--color-border, rgba(255, 255, 255, 0.15));
  cursor: pointer;
  box-sizing: border-box;
  transition:
    transform 0.12s ease,
    border 0.15s ease,
    box-shadow 0.15s ease;
}

.edit-selected-preset {
  align-self: stretch;
  animation: edit-action-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.swatch-tile:hover:not(.active) {
  border: 2px dashed rgba(255, 255, 255, 0.5);
  transform: scale(1.04);
}

.swatch-tile.active {
  border: 2px solid var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px var(--color-primary-light, rgba(59, 130, 246, 0.4));
}

.swatch-tile.editing {
  animation: swatch-pulse 2s infinite ease-in-out alternate;
}

@keyframes swatch-pulse {
  from {
    box-shadow: 0 0 0 2px var(--color-primary, #3b82f6);
    transform: scale(1);
  }
  to {
    box-shadow: 0 0 0 3px var(--color-primary-light, rgba(59, 130, 246, 0.4));
    transform: scale(1.02);
  }
}

.custom-editor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-secondary, #9ca3af);
  font-size: 12px;
  padding-top: 4px;
}

.custom-editor-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.apply-btn {
  align-self: flex-end;
}

.slider-row {
  width: 100%;
}

@keyframes edit-action-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .edit-selected-preset,
  .swatch-tile {
    animation: none;
    transition: none;
  }
}
</style>
