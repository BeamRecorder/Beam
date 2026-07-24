<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Image, Plus, Upload, Video } from "@lucide/vue";
import Button from "~/ui/button/Button.vue";
import ButtonGroup from "~/ui/button/ButtonGroup.vue";
import ColorPicker from "~/ui/ColorPicker/ColorPicker.vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Gradient from "~/ui/Gradient/Gradient.vue";
import { capture } from "../../../api/capture";
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  customColor,
  customGradient,
  type BackgroundMedia,
  type BackgroundMediaGroup,
  type BackgroundValue,
  type GradientBackground,
} from "../composables/backgroundCatalog";
import { useBackgroundPreviews } from "../composables/useBackgroundPreviews";

const props = defineProps<{
  selectedBackground: BackgroundValue | null;
  backgroundGroups: BackgroundMediaGroup[];
  projectId?: string | null;
  blurPercent: number;
}>();

const emit = defineEmits<{
  (e: "update:selectedBackground", value: BackgroundValue): void;
  (e: "update:blurPercent", value: number): void;
  (e: "import:background", value: BackgroundMedia): void;
}>();

const activeKind = ref<"image" | "video" | "color" | "gradient">("image");
const showCustomEditor = ref(false);
const hoveredId = ref<string | null>(null);
const INITIAL_MEDIA_COUNT = 15;
const visibleCount = ref(INITIAL_MEDIA_COUNT);

const blurDraft = ref(props.blurPercent);

const gridRef = ref<HTMLElement | null>(null);
const tileElements = new Map<string, Element>();
let previewObserver: IntersectionObserver | null = null;
const { previews, failed, request: requestPreview } = useBackgroundPreviews();

const customColorValue = ref("#4f46e5");
const customGradientValue = ref<GradientBackground>({
  type: "linear",
  angle: 135,
  stops: [
    { id: "start", position: 0, color: "#4f46e5", alpha: 1 },
    { id: "end", position: 1, color: "#ec4899", alpha: 1 },
  ],
});

const items = computed(
  () =>
    props.backgroundGroups.find((group) => group.kind === activeKind.value)
      ?.items ?? [],
);

const visibleItems = computed(() =>
  items.value.slice(0, visibleCount.value),
);

const hasMore = computed(() => visibleCount.value < items.value.length);

const observeMediaTile = (element: Element | null, item: BackgroundMedia) => {
  const previous = tileElements.get(item.id);
  if (previous) previewObserver?.unobserve(previous);
  if (!element) {
    tileElements.delete(item.id);
    return;
  }
  tileElements.set(item.id, element);
  previewObserver?.observe(element);
};

const observeVisibleTiles = () => {
  for (const item of visibleItems.value) {
    const element = tileElements.get(item.id);
    if (element) previewObserver?.observe(element);
  }
};

const scheduleVisibleTileObservation = () => {
  requestAnimationFrame(() => nextTick(observeVisibleTiles));
};

onMounted(() => {
  previewObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const item = visibleItems.value.find((candidate) => tileElements.get(candidate.id) === entry.target);
      if (item?.kind === "image") requestPreview(item);
    }
  }, { root: null, rootMargin: "120px", threshold: 0.01 });
  scheduleVisibleTileObservation();
});

onUnmounted(() => {
  previewObserver?.disconnect();
  tileElements.clear();
});

// Instant tab switch
const switchKind = (kind: "image" | "video" | "color" | "gradient") => {
  if (activeKind.value === kind) return;

  activeKind.value = kind;
  visibleCount.value = INITIAL_MEDIA_COUNT;
  showCustomEditor.value = false;

  if (gridRef.value) {
    gridRef.value.scrollTop = 0;
  }

  scheduleVisibleTileObservation();

};

watch(visibleItems, (newItems) => {
  void newItems;
  scheduleVisibleTileObservation();
}, { flush: "post" });

const loadMore = () => {
  visibleCount.value = Math.min(items.value.length, visibleCount.value + INITIAL_MEDIA_COUNT);
};

const isSelected = (entry: BackgroundValue) =>
  props.selectedBackground?.id === entry.id;

const selectColor = (color: string) => {
  customColorValue.value = color;
  emit("update:selectedBackground", customColor(color));
};

const selectGradient = (gradient: GradientBackground) => {
  emit("update:selectedBackground", customGradient(gradient));
};

const triggerImport = async () => {
  if (!props.projectId) return;
  const background = await capture.pickProjectBackgroundMedia(props.projectId);
  if (background) {
    emit("import:background", background);
  }
};
</script>

<template>
  <div class="canvas-panel-container">
    <!-- ButtonGroup Tabs Navigation -->
    <ButtonGroup aria-label="Background type" class="kind-group">
      <Button
        size="xs"
        :variant="activeKind === 'image' ? 'primary' : 'ghost'"
        :icon="Image"
        @click="switchKind('image')"
      >
        Image
      </Button>
      <Button
        size="xs"
        :variant="activeKind === 'video' ? 'primary' : 'ghost'"
        :icon="Video"
        @click="switchKind('video')"
      >
        Video
      </Button>
      <Button
        size="xs"
        :variant="activeKind === 'color' ? 'primary' : 'ghost'"
        @click="switchKind('color')"
      >
        Couleur
      </Button>
      <Button
        size="xs"
        :variant="activeKind === 'gradient' ? 'primary' : 'ghost'"
        @click="switchKind('gradient')"
      >
        Dégradé
      </Button>
    </ButtonGroup>

    <!-- Custom Background Import Button -->
    <Button
      variant="secondary"
      size="sm"
      block
      :icon="Upload"
      class="import-btn"
      @click="triggerImport"
    >
      Importer un fond personnalisé
    </Button>

    <!-- Hardware-Accelerated Tab Content Container -->
    <div :key="activeKind" class="tab-content-panel">
      <!-- Image & Video Media Grid -->
      <div
        v-if="activeKind === 'image' || activeKind === 'video'"
        ref="gridRef"
        class="media-scroll-grid"
      >
        <button
          v-for="item in visibleItems"
          :key="item.id"
          type="button"
          class="media-tile"
          :ref="(element) => observeMediaTile(element, item)"
          :class="{ active: isSelected(item), loaded: Boolean(previews[item.id] || failed[item.id]) }"
          @click="emit('update:selectedBackground', item)"
          @mouseenter="hoveredId = item.id"
          @mouseleave="hoveredId = null"
        >
          <video
            v-if="item.kind === 'video' && (hoveredId === item.id || isSelected(item))"
            :src="item.path"
            muted
            autoplay
            loop
            preload="none"
            class="media-content"
          />
          <span v-else-if="item.kind === 'video'" class="video-placeholder">
            <Video :size="16" />
          </span>
          <img
            v-else-if="previews[item.id] || failed[item.id]"
            :src="previews[item.id] || item.path"
            :alt="item.name"
            class="media-content loaded"
          />
        </button>
        <div
          v-if="hasMore"
          class="load-more"
        >
          <Button
            variant="secondary"
            size="sm"
            block
            @click="loadMore"
          >
            Afficher plus
          </Button>
        </div>
      </div>

      <!-- Color Swatches Grid -->
      <div v-else-if="activeKind === 'color'" class="swatches-section">
        <div class="swatches-grid">
          <button
            type="button"
            class="swatch-tile custom-add-tile"
            :class="{ active: isSelected(customColor(customColorValue)) }"
            aria-label="Couleur personnalisée"
            @click="showCustomEditor = !showCustomEditor"
          >
            <Plus :size="16" />
          </button>
          <button
            v-for="item in BACKGROUND_COLORS"
            :key="item.id"
            type="button"
            class="swatch-tile"
            :class="{ active: isSelected(item) }"
            :style="{ background: item.color }"
            :aria-label="item.name"
            @click="emit('update:selectedBackground', item)"
          />
        </div>
        <div v-if="showCustomEditor" class="custom-editor-row">
          <span>Couleur personnalisée</span>
          <ColorPicker
            :model-value="customColorValue"
            @update:model-value="selectColor"
          />
        </div>
      </div>

      <!-- Gradient Presets Grid -->
      <div v-else class="gradients-section">
        <div class="gradients-grid">
          <button
            type="button"
            class="swatch-tile custom-add-tile"
            :class="{ active: isSelected(customGradient(customGradientValue)) }"
            aria-label="Dégradé personnalisé"
            @click="showCustomEditor = !showCustomEditor"
          >
            <Plus :size="16" />
          </button>
          <button
            v-for="item in BACKGROUND_GRADIENTS"
            :key="item.id"
            type="button"
            class="swatch-tile"
            :class="{ active: isSelected(item) }"
            :style="{
              background: `linear-gradient(${item.gradient.angle}deg, ${item.gradient.stops.map(s => `${s.color} ${s.position * 100}%`).join(', ')})`
            }"
            :aria-label="item.name"
            @click="emit('update:selectedBackground', item)"
          />
        </div>
        <div v-if="showCustomEditor" class="custom-editor-box">
          <Gradient v-model="customGradientValue" :show-angle="true" />
          <Button
            size="sm"
            class="apply-btn"
            @click="selectGradient(customGradientValue)"
          >
            Utiliser ce dégradé
          </Button>
        </div>
      </div>
    </div>

    <!-- Blur Slider -->
    <div class="slider-row">
      <BigSlider
        :model-value="blurDraft"
        :min="0"
        :max="100"
        :step="1"
        label="Blur"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="blurDraft = $event"
        @interaction-end="emit('update:blurPercent', blurDraft)"
      />
    </div>
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
  transition: border-color var(--fast) ease, box-shadow var(--fast) ease;
  contain: strict;
}

.media-tile::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--color-bg-surface-hover);
  pointer-events: none;
}

.media-tile.loaded::before {
  display: none;
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
  border-radius: 8px;
  transition: opacity 0.15s ease;
}

img.media-content {
  opacity: 0;
}

img.media-content.loaded {
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
  border-radius: 8px;
}

.load-more { grid-column: 1 / -1; justify-self: stretch; width: 100%; }

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
  transition: transform 0.12s ease, border 0.15s ease, box-shadow 0.15s ease;
}

.swatch-tile:hover:not(.active) {
  border: 2px dashed rgba(255, 255, 255, 0.5);
  transform: scale(1.04);
}

.swatch-tile.active {
  border: 2px solid var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px var(--color-primary-light, rgba(59, 130, 246, 0.4));
}

.custom-add-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #9ca3af);
  background: repeating-conic-gradient(rgba(255, 255, 255, 0.1) 0 25%, rgba(0, 0, 0, 0.3) 0 50%) 50% / 10px 10px;
  border-style: dashed;
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
</style>
