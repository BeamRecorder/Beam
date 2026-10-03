<script setup lang="ts">
import { inject, onScopeDispose } from 'vue';
import ReorderGroup from '~/ui/transitions/ReorderGroup.vue';
import type { ReorderGroupProps } from '~/ui/transitions/reorder-types';
import { TIMELINE_SURFACE_KEY } from './timeline-surface-types';

defineProps<Pick<ReorderGroupProps, 'order' | 'itemAttribute'>>();
const surface = inject(TIMELINE_SURFACE_KEY);
if (!surface) throw new Error('Timeline reorder group requires the shared surface.');
const owner = Symbol('timeline-row-move');
const follow = (moving: boolean) => surface.followMoves(owner, moving);
onScopeDispose(() => follow(false));
</script>

<template>
  <ReorderGroup :order="order" :item-attribute="itemAttribute" :animate-membership="false" @moving="follow">
    <slot />
  </ReorderGroup>
</template>
