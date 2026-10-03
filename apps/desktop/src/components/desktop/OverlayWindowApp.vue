<script setup lang="ts">
import type { Component } from 'vue';
import ToastProvider from '~/components/ui/toast/ToastProvider.vue';
defineProps<{ content: Component }>();
</script>

<template>
  <ToastProvider />
  <component :is="content" />
</template>
