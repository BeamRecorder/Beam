<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Image, Plus, Upload, Video } from "@lucide/vue";
import Button from "~/ui/button/Button.vue";
import ButtonGroup from "~/ui/button/ButtonGroup.vue";
import ColorPicker from "~/ui/ColorPicker/ColorPicker.vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Gradient from "~/ui/Gradient/Gradient.vue";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
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
const visibleCount = ref(32);
const loadedImages = ref<Record<string, boolean>>({});
const blurDraft = ref(props.blurPercent);

const gridRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

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

const setupObserver = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (!sentinelRef.value || !hasMore.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore.value) {
        requestAnimationFrame(() => {
          visibleCount.value = Math.min(
            items.value.length,
            visibleCount.value + 16,
          );
        });
      }
    },
    {
      root: gridRef.value,
      rootMargin: "120px",
      threshold: 0.01,
    },
  );

  observer.observe(sentinelRef.value);
};

onMounted(() => {
  setupObserver();
});

onUnmounted(() => {
  if (observer) observer.disconnect();
});

// Watch tab or items count to reset scroll & re-attach observer
watch([activeKind, () => items.value.length], () => {
  visibleCount.value = 32;
  showCustomEditor.value = false;
  if (gridRef.value) {
    gridRef.value.scrollTop = 0;
  }
  nextTick(() => {
    setupObserver();
  });
});

// Re-observe when visibleItems expand until scrollbar is created or all items loaded
watch(visibleItems, () => {
  nextTick(() => {
    setupObserver();
  });
});

const markImageLoaded = (id: string) => {
  loadedImages.value[id] = true;
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
        @click="activeKind = 'image'"
      >
        Image
      </Button>
      <Button
        size="xs"
        :variant="activeKind === 'video' ? 'primary' : 'ghost'"
        :icon="Video"
        @click="activeKind = 'video'"
      >
        Video
      </Button>
      <Button
        size="xs"
        :variant="activeKind === 'color' ? 'primary' : 'ghost'"
        @click="activeKind = 'color'"
      >
        Couleur
      </Button>
      <Button
        size="xs"
        :variant="activeKind === 'gradient' ? 'primary' : 'ghost'"
        @click="activeKind = 'gradient'"
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

    <!-- Animated Tab Content Panel -->
    <div
      :key="activeKind"
      v-motion
      :initial="{ opacity: 0, y: 4 }"
      :enter="{ opacity: 1, y: 0, transition: { duration: 120, ease: 'easeOut' } }"
      class="tab-content-panel"
    >
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
          :class="{ active: isSelected(item) }"
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
          <template v-else>
            <Skeleton
              v-if="!loadedImages[item.id]"
              class="media-content media-skeleton"
              width="100%"
              height="100%"
            />
            <img
              :src="item.path"
              :alt="item.name"
              class="media-content"
              :class="{ loaded: loadedImages[item.id] }"
              loading="lazy"
              decoding="async"
              @load="markImageLoaded(item.id)"
            />
          </template>
        </button>

        <!-- Sentinel element for IntersectionObserver infinite loading -->
        <div
          v-if="hasMore"
          ref="sentinelRef"
          class="scroll-sentinel"
        />
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

/* 8-Column Media Grid & Internal Custom Scrollbar */
.media-scroll-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 6px;
  box-sizing: border-box;
  background: var(--color-bg-surface, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md, 8px);
}

.media-scroll-grid::-webkit-scrollbar {
  width: 6px;
}
.media-scroll-grid::-webkit-scrollbar-track {
  background: var(--color-bg-element, rgba(0, 0, 0, 0.2));
  border-radius: 4px;
}
.media-scroll-grid::-webkit-scrollbar-thumb {
  background: var(--color-border, rgba(255, 255, 255, 0.18));
  border-radius: 4px;
}
.media-scroll-grid::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted, rgba(255, 255, 255, 0.35));
}

/* Media Tile Element */
.media-tile {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border-radius: 8px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
  transition: transform 0.12s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.media-tile:hover {
  transform: scale(1.04);
  border-color: rgba(255, 255, 255, 0.3);
}

.media-tile.active {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px var(--color-primary-light, rgba(59, 130, 246, 0.4));
  transform: scale(1.02);
}

.media-content {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 6px;
  transition: opacity 0.15s ease;
}

img.media-content {
  opacity: 0;
}

img.media-content.loaded {
  opacity: 1;
}

.media-skeleton {
  position: absolute;
  inset: 0;
  border-radius: 6px;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #9ca3af);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
}

.scroll-sentinel {
  grid-column: 1 / -1;
  height: 10px;
  width: 100%;
  pointer-events: none;
  opacity: 0;
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
  gap: 6px;
}

.swatch-tile {
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
  cursor: pointer;
  box-sizing: border-box;
  transition: transform 0.12s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.swatch-tile:hover {
  transform: scale(1.04);
}

.swatch-tile.active {
  border-color: var(--color-primary, #3b82f6);
  outline: 2px solid var(--color-primary, #3b82f6);
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
