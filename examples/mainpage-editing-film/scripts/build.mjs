import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
await build({
  root,
  configFile: false,
  base: './',
  publicDir: false,
  plugins: [
    vue(),
    {
      name: 'offline-background-catalog',
      resolveId(id) {
        if (id === 'virtual:public-background-media') return '\0film-background-catalog';
      },
      load(id) {
        if (id === '\0film-background-catalog') return 'export default {images:[],videos:[]}';
      },
    },
  ],
  resolve: {
    dedupe: ['vue'],
    alias: [
      { find: /^.*\/useBackgroundPresets(?:\.ts)?$/, replacement: resolve(root, 'src/offline-presets.ts') },
      { find: /^.*\/useFontCatalog(?:\.ts)?$/, replacement: resolve(root, 'src/offline-fonts.ts') },
      { find: /^.*\/project-font-source(?:\.ts)?$/, replacement: resolve(root, 'src/offline-fonts.ts') },
      { find: /^.*\/public-asset(?:\.ts)?$/, replacement: resolve(root, 'src/offline-public-assets.ts') },
      { find: /^.*\/useAppUpdates(?:\.ts)?$/, replacement: resolve(root, 'src/offline-updates.ts') },
      { find: /^.*\/useTimelineInsertPreference(?:\.ts)?$/, replacement: resolve(root, 'src/offline-insert.ts') },
      { find: /^.*\/useThumbnails(?:\.ts)?$/, replacement: resolve(root, 'src/offline-thumbnails.ts') },
      { find: '~/ui', replacement: resolve(repository, 'apps/desktop/src/components/ui') },
      { find: '~', replacement: resolve(repository, 'apps/desktop/src') },
      { find: /^\/font\//, replacement: resolve(repository, 'public/font') + '/' },
    ],
  },
  build: { assetsInlineLimit: 0, outDir: resolve(root, 'dist'), emptyOutDir: true },
});
