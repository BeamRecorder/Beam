<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import ColorPickerCustom from './ColorPickerCustom.vue';
import Popover from '../popover/Popover.vue';
import Input from '../input/Input.vue';

const props = defineProps({
    modelValue: {
        type: String,
        default: '#f57600',
    },
    label: {
        type: String,
        default: undefined,
    },
    inline: {
        type: Boolean,
        default: false,
    },
    type: {
        type: String as () => 'standard' | 'triangle',
        default: 'standard',
    },
    alphaValue: {
        type: Number,
        default: 1,
    },
    showAlpha: {
        type: Boolean,
        default: false,
    },
    showLabel: {
        type: Boolean,
        default: true,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    disabledReasonKey: {
        type: String,
        default: undefined,
    },
    disabledReason: {
        type: String,
        default: undefined,
    },
});

const emit = defineEmits([
    'update:modelValue',
    'update:alpha',
    'drag-start',
    'drag-end',
]);

const displayLabel = computed(() => props.label ?? 'Color');

const isPopoverOpen = ref(false);
const isDragging = ref(false);
const isMobileViewport = ref(false);

function updateIsMobileViewport() {
    isMobileViewport.value = window.innerWidth <= 480;
}

onMounted(() => {
    updateIsMobileViewport();
    window.addEventListener('resize', updateIsMobileViewport, {
        passive: true,
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', updateIsMobileViewport);
});

const updateColor = (val: string | number) => {
    if (props.disabled) return;
    emit('update:modelValue', String(val));
};
const updateAlpha = (val: number) => {
    emit('update:alpha', val);
};

function handleDragStart() {
    isDragging.value = true;
    emit('drag-start');
}

function handleDragEnd() {
    isDragging.value = false;
    emit('drag-end');
}
</script>

<template>
    <div
        class="color-picker-wrapper"
        :class="{ 'is-disabled': props.disabled }"
        :title="props.disabled ? props.disabledReason : undefined"
        :data-disabled-reason-key="props.disabled ? props.disabledReasonKey : undefined"
    >
        <label
            v-if="showLabel && !inline"
            class="color-picker-label"
        >
            {{ displayLabel }}
        </label>

        <!-- Inline Mode: just the full picker -->
        <ColorPickerCustom
            v-if="inline"
            :model-value="props.modelValue"
            :type="type"
            :alpha-value="props.alphaValue"
            :show-alpha="props.showAlpha"
            :disabled="props.disabled"
            @update:model-value="updateColor"
            @update:alpha="updateAlpha"
            @drag-start="handleDragStart"
            @drag-end="handleDragEnd"
        />

        <!-- Trigger Mode: color bubble + popover -->
        <Popover
            v-else
            align="left"
            :match-trigger-width="false"
            block
            @toggle="isPopoverOpen = $event"
        >
            <template #trigger="{ isOpen }">
                <div
                    class="color-picker-trigger-container"
                    :class="{ 'is-standard': type === 'standard', 'is-active': isOpen, 'is-disabled': props.disabled }"
                >
                    <div
                        class="color-picker-bubble"
                        :style="{ backgroundColor: modelValue }"
                    >
                        <div class="bubble-inner"></div>
                    </div>
                    <Input
                        class="color-hex-input"
                        :modelValue="modelValue.toUpperCase()"
                        :disabled="props.disabled"
                        @update:modelValue="updateColor"
                        @click.stop
                    />
                </div>
            </template>

            <template #default="{ close }">
                <div
                    class="popover-picker-content"
                    :class="{ 'is-triangle': type === 'triangle' }"
                    @click.stop
                >
                    <ColorPickerCustom
                        :model-value="props.modelValue"
                        :type="type"
                        :alpha-value="props.alphaValue"
                        :show-alpha="props.showAlpha"
                        @update:model-value="updateColor"
                        @update:alpha="updateAlpha"
                        @drag-start="handleDragStart"
                        @drag-end="handleDragEnd"
                        @close="close"
                        flat
                    />
                </div>
            </template>
        </Popover>
    </div>
</template>

<style scoped>
    .color-picker-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    }

    .color-picker-wrapper :deep(.popover-container),
    .color-picker-wrapper :deep(.popover-trigger) {
        width: 100%;
        display: block;
    }

    .color-picker-wrapper.is-disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .color-picker-label {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text-secondary, #94a3b8);
    }

    .color-picker-trigger-container {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--color-bg-element);
        padding: 4px 8px;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        transition: border-color var(--fast) ease, background-color var(--fast) ease;
        width: 100%;
        box-sizing: border-box;
    }

    .color-picker-trigger-container:hover {
        background: var(--color-bg-surface-hover);
        border-color: var(--color-border-dark);
    }

    .color-picker-trigger-container.is-disabled {
        pointer-events: none;
        opacity: 0.6;
    }

    .color-picker-trigger-container.is-standard:hover {
        border-color: var(--color-border-dark);
    }

    .color-picker-bubble {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        position: relative;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        cursor: pointer;
        flex-shrink: 0;
    }

    .bubble-inner {
        position: absolute;
        inset: 0;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    }

    .color-hex-input {
        flex: 1;
        width: 100%;
        min-width: 0;
    }

    .color-hex-input.input-wrapper {
        background: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        height: auto !important;
        padding: 0 !important;
        min-height: 0 !important;
    }

    .color-hex-input :deep(.input-element) {
        font-family: var(--font-mono, monospace);
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-primary, #ffffff);
        background: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        width: 100%;
        min-width: 0;
        padding: 0 !important;
        height: auto !important;
    }

    .popover-picker-content {
        padding: 0;
        width: fit-content;
        max-width: calc(100vw - 32px);
        overflow: hidden;
    }

    .popover-picker-content.is-triangle {
        width: fit-content;
    }

    @media (max-width: 480px) {
        .color-picker-trigger-container {
            min-height: 40px;
            min-width: 132px;
        }

        .color-picker-bubble {
            width: 32px;
            height: 32px;
        }

        .popover-picker-content,
        .popover-picker-content.is-triangle {
            width: min(284px, calc(100vw - 32px));
            padding: 0;
        }
    }
</style>
