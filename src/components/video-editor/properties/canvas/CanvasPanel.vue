<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SlidersHorizontal, Upload, Video } from '@lucide/vue';
import AddTileButton from '~/ui/button/AddTileButton.vue';
import Button from '~/ui/button/Button.vue';
import CanvasBackgroundTabs from './CanvasBackgroundTabs.vue';
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
import { useCanvasMediaTiles } from './useCanvasMediaTiles';
import { useBackgroundPresets } from './useBackgroundPresets';
import { useTranslate } from '~/i18n/useTranslate';
import type { WatermarkSettings } from '../../canvas/output-canvas';
import WatermarkControls from './WatermarkControls.vue';

const { t } = useTranslate('CanvasPanel');
const { t: tScreenshot } = useTranslate('ScreenshotEditor');

const props = defineProps<{
  still?: boolean;
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

const blurDraft = ref(props.blurPercent);
watch(
  () => props.blurPercent,
  (value) => {
    blurDraft.value = value;
  },
);
const updateBlur = (value: number) => {
  blurDraft.value = value;
  emit('update:blurPercent', value);
};

const activeKind = ref<'image' | 'video' | 'color' | 'gradient'>('image');
const {
  colorPresets,
  gradientPresets,
  customColorValue,
  customGradientValue,
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

const { gridRef, previews, failed, visibleItems, hasMore, isLoadingMore, mediaTileRef, cancelLoadMore, loadMore } =
  useCanvasMediaTiles(items);

const switchKind = (kind: 'image' | 'video' | 'color' | 'gradient') => {
  if (activeKind.value === kind) return;

  cancelLoadMore();
  activeKind.value = kind;
  closeCustomEditor();

  if (gridRef.value) {
    gridRef.value.scrollTop = 0;
  }
};

const isSelected = (entry: BackgroundValue) => props.selectedBackground?.id === entry.id;
const selectedColorPreset = computed(() => colorPresets.value.find((item) => isSelected(item)) ?? null);
const selectedGradientPreset = computed(() => gradientPresets.value.find((item) => isSelected(item)) ?? null);

const triggerImport = async () => {
  const kind = props.still
    ? 'image'
    : activeKind.value === 'image' || activeKind.value === 'video'
      ? activeKind.value
      : 'media';
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
</script>

<template>
  <div class="canvas-panel-container">
    <CanvasBackgroundTabs :model-value="activeKind" :still="still" @update:model-value="switchKind" />

    <Button variant="secondary" size="sm" block :icon="Upload" class="import-btn" @click="triggerImport">
      {{ importLabel }}
    </Button>

    <div class="tab-content-panel">
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
          @click="emit('update:selectedBackground', item)"
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

    <div class="slider-row">
      <BigSlider
        :model-value="blurDraft"
        :min="0"
        :max="100"
        :step="1"
        :label="t('blur')"
        :format-value="(value: number) => `${Math.round(value)}%`"
        @update:model-value="updateBlur"
        @interaction-end="emit('update:blurPercent', blurDraft)"
      />
    </div>

    <RemoveBackgroundControl
      :description="still ? tScreenshot('removeBackgroundDescription') : undefined"
      :model-value="!showBackground"
      @update:model-value="emit('update:showBackground', !$event)"
    />

    <WatermarkControls
      :description="still ? tScreenshot('watermarkDescription') : undefined"
      :model-value="watermark"
      @update:model-value="emit('update:watermark', $event)"
    />
  </div>
</template>

<style scoped src="./canvas-panel.css"></style>
