/// <reference types="vite/client" />

declare module 'virtual:public-background-media' {
  export const images: string[];
  export const videos: string[];
  const wallpapers: { images: string[]; videos: string[] };
  export default wallpapers;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
