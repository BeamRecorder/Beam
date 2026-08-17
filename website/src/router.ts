import type { RouteRecordRaw } from 'vue-router';
import FaqPage from './pages/FaqPage.vue';
import HomePage from './pages/HomePage.vue';
import InstallPage from './pages/InstallPage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/faq',
    name: 'faq',
    component: FaqPage,
  },
  {
    path: '/install',
    name: 'install',
    component: InstallPage,
  },
];
