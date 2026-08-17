import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import { createWebsiteI18n, websiteI18n } from './i18n';
import { routes } from './router';
import { initializeWebsiteTheme } from './composables/useWebsiteTheme';
import './styles/tokens.css';
import './styles/global.css';

export const createApp = ViteSSG(App, { routes }, ({ app, isClient }) => {
  app.use(isClient ? websiteI18n : createWebsiteI18n('en'));

  if (isClient) {
    document.documentElement.lang = websiteI18n.global.locale.value;
    initializeWebsiteTheme();
  }
});
