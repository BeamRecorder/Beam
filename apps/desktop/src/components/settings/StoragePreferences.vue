<script setup lang="ts">
import DirectoryPreference from './DirectoryPreference.vue';
</script>
<template>
  <div class="storage-preferences">
    <DirectoryPreference kind="projects" />
    <DirectoryPreference kind="exports" />
  </div>
</template>
<style scoped>
.storage-preferences {
  display: grid;
  gap: 16px;
  min-width: 0;
}
</style>
