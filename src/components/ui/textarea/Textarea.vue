<script setup lang="ts">
import { useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
  rows?: number
  id?: string
  ariaLabel?: string
}>(), { placeholder: '', disabled: false, rows: 5, ariaLabel: undefined })

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <textarea
    v-bind="attrs"
    :id="id"
    :rows="rows"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-label="ariaLabel"
    class="textarea-element"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped>
.textarea-element { display: block; width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-element); color: var(--text-primary); font: inherit; line-height: 1.45; resize: vertical; outline: none; box-sizing: border-box; transition: border-color var(--fast), box-shadow var(--fast); }
.textarea-element::placeholder { color: var(--text-muted); }
.textarea-element:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light); }
.textarea-element:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
