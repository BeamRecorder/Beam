<script setup lang="ts">
import { nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vitepress';

const route = useRoute();

const replayPageEntrance = async () => {
  await nextTick();
  const page = document.querySelector<HTMLElement>('.VPDoc .container, .VPHome');
  if (!page) return;

  page.classList.remove('beam-doc-page-enter');
  void page.offsetWidth;
  page.classList.add('beam-doc-page-enter');
};

onMounted(replayPageEntrance);
watch(() => route.path, replayPageEntrance, { flush: 'post' });
</script>

<template></template>
