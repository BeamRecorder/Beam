import type { RouteRecordRaw } from 'vue-router';
import HomePage from './pages/HomePage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/faq',
    name: 'faq',
    component: () => import('./pages/FaqPage.vue'),
  },
  {
    path: '/install',
    name: 'install',
    component: () => import('./pages/InstallPage.vue'),
  },
];
