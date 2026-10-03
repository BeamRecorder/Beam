<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SlidersHorizontal, Video } from '@lucide/vue';
import AddTileButton from '~/ui/button/AddTileButton.vue';
import Button from '~/ui/button/Button.vue';
import CanvasPanelLayout from './CanvasPanelLayout.vue';
import Popover from '~/ui/popover/Popover.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import BackgroundPresetComposer from './BackgroundPresetComposer.vue';
import { capture } from '../../../../api/capture';
import { customColor, customGradient, gradientCssBackground } from '../../composables/backgroundCatalog';
import {
  type BackgroundMedia,
  type BackgroundMediaGroup,
  type BackgroundValue,
} from '@beam/engine/shared/background-types';
import { useCanvasMediaTiles } from './useCanvasMediaTiles';
import { useBackgroundPresets } from './useBackgroundPresets';
import { useTranslate } from '~/i18n/useTranslate';
import type { WatermarkSettings } from '@beam/engine/layout/output-canvas';

const { t } = useTranslate('CanvasPanel');

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
  const kind = !props.still && activeKind.value === 'video' ? 'video' : 'image';
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
  <CanvasPanelLayout
    :still="still"
    :show-background="showBackground"
    :active-kind="activeKind"
    :blur-percent="blurDraft"
    :watermark="watermark"
    @update:show-background="emit('update:showBackground', $event)"
    @update:active-kind="switchKind"
    @update:blur-percent="updateBlur"
    @blur-interaction-end="emit('update:blurPercent', blurDraft)"
    @update:watermark="emit('update:watermark', $event)"
  >
    <div v-show="activeKind === 'image' || activeKind === 'video'" ref="gridRef" class="media-scroll-grid">
      <Tooltip :content="importLabel" class="media-import-tile" :style="{ width: '100%', display: 'flex' }">
        <AddTileButton :label="importLabel" class="import-tile" @click="triggerImport" />
      </Tooltip>
      <div v-if="!items.length" class="empty-backgrounds">
        <span>{{ t('noBackgroundFound') }}</span>
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
            <Tooltip :content="t('customColor')" class="preset-add-tooltip" :style="{ width: '100%', display: 'flex' }">
              <AddTileButton
                :active="isSelected(customColor(customColorValue))"
                :label="t('customColor')"
                @click="beginAdd('color')"
              />
            </Tooltip>
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
          :style="{ backgroundColor: item.color }"
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
            <Tooltip
              :content="t('customGradient')"
              class="preset-add-tooltip"
              :style="{ width: '100%', display: 'flex' }"
            >
              <AddTileButton
                :active="isSelected(customGradient(customGradientValue))"
                :label="t('customGradient')"
                @click="beginAdd('gradient')"
              />
            </Tooltip>
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
            backgroundImage: gradientCssBackground(item.gradient),
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
  </CanvasPanelLayout>
</template>

<style scoped src="./canvas-panel.css"></style>
