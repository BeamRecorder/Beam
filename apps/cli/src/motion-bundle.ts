import { dirname } from 'node:path';
import { listBundle } from './render-bundle';

/** Framework compilation is loaded only for motion jobs, never for document editing or normal exports. */
export async function buildMotionBundle(entry: string, directory: string) {
  const [{ build }, { default: vue }] = await Promise.all([import('vite'), import('@vitejs/plugin-vue')]);
  await build({
    root: dirname(entry),
    configFile: false,
    publicDir: false,
    base: '/motion/',
    logLevel: 'silent',
    plugins: [vue()],
    build: { outDir: directory, emptyOutDir: true, rollupOptions: { input: entry } },
  });
  return new Map([...(await listBundle(directory))].map(([route, file]) => ['/motion' + route, file]));
}
