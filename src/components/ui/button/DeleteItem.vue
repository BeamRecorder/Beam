<script setup lang="ts">
import { ref } from 'vue'
import Button from './Button.vue'
import { Trash2 } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    label?: string
    confirm?: boolean
    confirmLabel?: string
    variant?: 'danger' | 'ghost' | 'secondary' | 'outline'
    size?: 'xs' | 'sm' | 'md' | 'lg'
    block?: boolean
    disabled?: boolean
  }>(),
  {
    label: 'Delete',
    confirm: false,
    confirmLabel: 'Confirm Delete?',
    variant: 'danger',
    size: 'sm',
    block: true,
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const isConfirming = ref(false)

const handleClick = (e: MouseEvent) => {
  if (props.confirm && !isConfirming.value) {
    isConfirming.value = true
    setTimeout(() => {
      isConfirming.value = false
    }, 3000)
    return
  }
  isConfirming.value = false
  emit('click', e)
}
</script>

<template>
  <Button
    :variant="isConfirming ? 'danger' : variant"
    :size="size"
    :block="block"
    :disabled="disabled"
    :icon="Trash2"
    class="delete-item-btn"
    @click="handleClick"
  >
    {{ isConfirming ? confirmLabel : label }}
  </Button>
</template>

<style scoped>
.delete-item-btn {
  transition: all var(--fast, 0.15s) ease;
}
</style>
