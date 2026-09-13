<script setup lang="ts">
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import PropertiesPanelHeader from '../properties/PropertiesPanelHeader.vue';
defineProps<{ title: string }>();
</script>

<template>
  <aside class="properties-island" :aria-label="title">
    <div class="properties-scale-content">
      <PropertiesPanelHeader :title="title"
        ><template #actions><slot name="actions" /></template
      ></PropertiesPanelHeader>
      <ScrollShadow class="panel-scroll-shadow" :class="{ 'has-footer': $slots.footer }" viewport-class="panel-content">
        <div class="panel-body"><slot /></div>
      </ScrollShadow>
      <footer v-if="$slots.footer" class="properties-footer"><slot name="footer" /></footer>
    </div>
  </aside>
</template>

<style scoped src="../properties/PropertiesPanel.css"></style>
<style scoped>
.properties-island {
  flex-shrink: 0;
}
</style>
