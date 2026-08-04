import { computed, ref } from 'vue'

const interactionDepth = ref(0)

/**
 * Shared transaction state for controls that update a property continuously
 * while the user is dragging it.
 */
export const propertyInteractionActive = computed(() => interactionDepth.value > 0)

export const beginPropertyInteraction = () => {
  interactionDepth.value += 1
}

export const endPropertyInteraction = () => {
  interactionDepth.value = Math.max(0, interactionDepth.value - 1)
}

export const resetPropertyInteractions = () => {
  interactionDepth.value = 0
}
