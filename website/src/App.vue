<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import WebsiteTopbar from '@website/components/WebsiteTopbar.vue';
import WebsiteFooter from '@website/components/WebsiteFooter.vue';
import type { WebsitePlatform } from '@website/lib/platform-downloads';
import headlineFontUrl from '../../public/font/StackSansHeadline-VariableFont_wght.woff2?url';
import { detectWebsiteLocale, syncWebsiteLocale } from '@website/i18n';

useHead({
  link: [{ rel: 'preload', href: headlineFontUrl, as: 'font', type: 'font/woff2', crossorigin: 'anonymous' }],
});

onMounted(() => void syncWebsiteLocale(detectWebsiteLocale()));

const router = useRouter();
const goHome = () => {
  void router.push('/');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const beginInstall = (platform: WebsitePlatform | null) => {
  void router.push({ path: '/install', query: platform ? { os: platform } : {} });
  window.scrollTo({ top: 0 });
};
</script>

<template>
  <WebsiteTopbar @install="beginInstall" @home="goHome" />
  <RouterView v-slot="{ Component, route }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="route.fullPath" />
    </Transition>
  </RouterView>

  <WebsiteFooter />
</template>
