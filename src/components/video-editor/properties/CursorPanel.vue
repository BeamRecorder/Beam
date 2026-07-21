<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import BigSlider from '~/ui/slider/BigSlider.vue'
import Switch from '~/ui/switch/Switch.vue'
import Select from '~/ui/select/Select.vue'
import { cursorOptions, cursorUrls, type CursorType } from '../composables/useCursorReplacer'

const props = defineProps<{
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedCursor', value: CursorType): void
  (e: 'update:cursorSize', value: number): void
  (e: 'update:cursorColor', value: string): void
  (e: 'update:enableShadow', value: boolean): void
  (e: 'update:enableRipple', value: boolean): void
}>()


const colorOptions = [
  { value: '#000000', label: 'Classic Black', color: '#000000' },
  { value: '#ff5a1f', label: 'Brand Orange', color: '#ff5a1f' },
  { value: '#10b981', label: 'Emerald Green', color: '#10b981' },
  { value: '#ef4444', label: 'Warning Red', color: '#ef4444' },
]

// Live preview blob generator
const previewBlobUrl = ref('')

const updatePreview = async () => {
  try {
    const urlPath = cursorUrls[props.selectedCursor]
    const response = await fetch(urlPath)
    if (!response.ok) return
    let svgContent = await response.text()
    
    // Replace size
    svgContent = svgContent
      .replace(/width="[^"]*"/, `width="${props.cursorSize}"`)
      .replace(/height="[^"]*"/, `height="${props.cursorSize}"`)

    // Color customization
    if (props.cursorColor !== '#000000') {
      svgContent = svgContent
        .replace(/fill="#000000"/gi, `fill="${props.cursorColor}"`)
        .replace(/fill="#000"/gi, `fill="${props.cursorColor}"`)
    }

    if (previewBlobUrl.value) {
      URL.revokeObjectURL(previewBlobUrl.value)
    }

    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
    previewBlobUrl.value = URL.createObjectURL(svgBlob)
  } catch (err) {
    console.error('Error updating cursor preview:', err)
  }
}

watch(
  () => [props.selectedCursor, props.cursorSize, props.cursorColor],
  () => {
    updatePreview()
  },
  { immediate: true }
)

onUnmounted(() => {
  if (previewBlobUrl.value) {
    URL.revokeObjectURL(previewBlobUrl.value)
  }
})
</script>

<template>
  <div class="options-group">
    <!-- Live Cursor Preview Box -->
    <div class="cursor-preview-container">
      <div 
        class="cursor-preview-box" 
        :class="{ 'has-shadow': enableShadow }"
      >
        <img 
          v-if="previewBlobUrl" 
          :src="previewBlobUrl" 
          class="cursor-preview-image" 
          :style="{ width: `${cursorSize}px`, height: `${cursorSize}px` }"
        />
        <div v-if="enableRipple" class="preview-ripple"></div>
      </div>
    </div>

    <div class="prop-item">
      <label class="prop-label">Cursor Style</label>
      <Select 
        :model-value="selectedCursor" 
        :options="cursorOptions" 
        :preview-on-hover="true"
        @update:modelValue="emit('update:selectedCursor', $event)"
      />
    </div>

    <div class="prop-item">
      <BigSlider 
        :model-value="cursorSize" 
        :min="16" 
        :max="64"
        label="Cursor Size"
        :format-value="(val) => `${val}px`"
        @update:modelValue="emit('update:cursorSize', $event)"
      />
    </div>

    <div class="prop-item">
      <label class="prop-label">Cursor Color</label>
      <Select 
        :model-value="cursorColor" 
        :options="colorOptions" 
        :preview-on-hover="true"
        @update:modelValue="emit('update:cursorColor', $event)"
      />
    </div>

    <div class="prop-row">
      <span class="prop-label">Drop Shadow</span>
      <Switch 
        :model-value="enableShadow" 
        @update:modelValue="emit('update:enableShadow', $event)"
      />
    </div>

    <div class="prop-row">
      <span class="prop-label">Click Ripple Effect</span>
      <Switch 
        :model-value="enableRipple" 
        @update:modelValue="emit('update:enableRipple', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* live preview styling */
.cursor-preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background-color: var(--color-bg-surface-hover);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  margin-bottom: 4px;
  position: relative;
  overflow: hidden;
}

.cursor-preview-box {
  width: 100px;
  height: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  border-radius: var(--radius-md);
  /* Checkerboard background pattern */
  background-image: 
    linear-gradient(45deg, var(--color-border-strong) 25%, transparent 25%), 
    linear-gradient(-45deg, var(--color-border-strong) 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, var(--color-border-strong) 75%), 
    linear-gradient(-45deg, transparent 75%, var(--color-border-strong) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
  border: 1px dashed var(--color-border-strong);
}

.cursor-preview-image {
  object-fit: contain;
  z-index: 2;
  pointer-events: none;
}

.cursor-preview-box.has-shadow .cursor-preview-image {
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
}

.preview-ripple {
  position: absolute;
  width: 50px;
  height: 50px;
  border: 2px solid var(--color-primary);
  border-radius: 50%;
  opacity: 0.8;
  animation: ripple-animation 2s infinite ease-out;
  z-index: 1;
}

@keyframes ripple-animation {
  0% {
    transform: scale(0.2);
    opacity: 1;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}
</style>

