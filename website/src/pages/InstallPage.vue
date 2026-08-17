<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import InstallConfirmation from '@website/components/InstallConfirmation.vue';
import type { WebsitePlatform } from '@website/lib/platform-downloads';
import { createHomeJsonLd } from '@website/seo/json-ld';
import { usePageSeo } from '@website/seo/use-page-seo';

const route = useRoute();
const requestedPlatform = computed<WebsitePlatform>(() => {
  const value = route.query.os;
  return value === 'macos' || value === 'linux' || value === 'windows' ? value : 'windows';
});
const autoStart = computed(() => route.query.os !== undefined);

usePageSeo({
  path: '/install',
  title: 'Download Beam for Windows, macOS, and Linux',
  description: 'Download the latest Beam screen recorder and video editor release for your operating system.',
  jsonLd: [createHomeJsonLd()[1]],
});
</script>

<template>
  <InstallConfirmation :platform="requestedPlatform" :auto-start="autoStart" />
</template>
