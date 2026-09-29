import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [solid({ solid: { moduleName: '@argui/solid', generate: 'universal' }, hot: false })],
  resolve: {
    preserveSymlinks: false,
    dedupe: ['solid-js', '@argui/solid', '@argui/host', '@argui/widgets'],
  },
  define: {
    __ARGUI_DEV_ASSETS__: JSON.stringify(process.env.ARGUI_APP_RELEASE !== '1'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  ssr: { noExternal: true, resolve: { conditions: ['browser'] } },
  build: {
    ssr: process.env.BEAM_UI_ENTRY === 'settings' ? 'src/solid/settingsMain.tsx' : process.env.BEAM_UI_ENTRY === 'editor' ? 'src/solid/editorMain.tsx' : 'src/solid/main.tsx',
    outDir: process.env.BEAM_UI_OUT_DIR ?? 'dist/native',
    target: 'es2022',
    rollupOptions: { output: { entryFileNames: process.env.BEAM_UI_ENTRY === 'settings' ? 'settings.mjs' : process.env.BEAM_UI_ENTRY === 'editor' ? 'editor.mjs' : 'app.mjs' } },
  },
})
