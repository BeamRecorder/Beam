import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, rm, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { prepareHtmlBundle } from './html-bundle';
import { htmlPublishCommands } from './html-publish';
import { createAuthoringSession, createRenderDocument, createStillDocument } from '@beam/engine';
import type { HtmlPublishArguments, LiveDocumentSnapshot } from './agent-types';
import type { HtmlComposition } from '@beam/engine/html/html-types';
import type { MediaAsset } from '@beam/engine';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
const args = (): HtmlPublishArguments => ({
  projectId: randomUUID(),
  expectedRevision: 0,
  entry: 'index.html',
  width: 64,
  height: 64,
  durationMs: 15000,
});
const asset = (): MediaAsset => ({
  id: randomUUID(),
  kind: 'image',
  name: 'HTML',
  origin: 'project',
  src: '/source.png',
  fileName: 'source.png',
  width: 64,
  height: 64,
  durationMs: 0,
  html: {
    version: 1,
    id: randomUUID(),
    revision: randomUUID(),
    entry: 'index.html',
    framework: 'html',
    width: 64,
    height: 64,
    durationMs: 15000,
    fps: 30,
  },
});
async function source() {
  const root = await mkdtemp(join(tmpdir(), 'beam-bundle-test-'));
  directories.push(root);
  await mkdir(join(root, 'composition'));
  await writeFile(
    join(root, 'composition/index.html'),
    '<html><body><script type="module" src="./main.ts"></script></body></html>',
  );
  await writeFile(
    join(root, 'composition/main.ts'),
    'const duration: number = 15000; Object.assign(window,{beamComposition:{seek(timeMs: number){document.body.textContent=String(Math.min(duration,timeMs));}}});',
  );
  return root;
}
describe('HTML publishing', () => {
  it('compiles an explicitly requested Vue source using the source project dependencies', async () => {
    const root = await source();
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'junction');
    await writeFile(join(root, 'composition/App.vue'), '<template><div>Optional Vue source</div></template>');
    await writeFile(
      join(root, 'composition/main.ts'),
      'import {createApp} from "vue"; import App from "./App.vue"; createApp(App).mount("body");',
    );
    const bundle = await prepareHtmlBundle({ ...args(), framework: 'vue', entry: 'composition/index.html' }, root);
    try {
      expect(await readFile(join(bundle.bundleDirectory, bundle.entry), 'utf8')).toContain('./assets/');
    } finally {
      await bundle.dispose();
    }
  });
  it('compiles ordinary TypeScript without Vue and freezes references', async () => {
    const root = await source();
    await writeFile(join(root, 'reference.png'), 'test reference');
    const bundle = await prepareHtmlBundle(
      { ...args(), entry: 'composition/index.html', references: [{ name: 'feature.png', source: 'reference.png' }] },
      root,
    );
    try {
      expect(await readFile(join(bundle.sourceDirectory, 'references/feature.png'), 'utf8')).toBe('test reference');
      const entry = await readFile(join(bundle.bundleDirectory, bundle.entry), 'utf8');
      expect(entry).toContain('./assets/');
      const files = await readdir(join(bundle.bundleDirectory, 'assets'));
      const script = await readFile(
        join(
          bundle.bundleDirectory,
          'assets',
          files.find((f) => f.endsWith('.js'))!,
        ),
        'utf8',
      );
      expect(script).toContain('beamComposition');
      expect(script).not.toContain('const duration: number');
    } finally {
      await bundle.dispose();
    }
  });
  it('rejects unsafe references, a missing entry and compilation errors', async () => {
    const root = await source();
    await expect(
      prepareHtmlBundle(
        { ...args(), entry: 'composition/index.html', references: [{ name: '../outside', source: 'x' }] },
        root,
      ),
    ).rejects.toThrow('plain file');
    await expect(prepareHtmlBundle({ ...args(), entry: 'missing.html' }, root)).rejects.toThrow();
    await writeFile(join(root, 'composition/main.ts'), 'this is not valid typescript ###');
    await expect(prepareHtmlBundle({ ...args(), entry: 'composition/index.html' }, root)).rejects.toThrow();
  });
  it('adds a video clip and updates the same asset while preserving user geometry/timing', () => {
    const session = createAuthoringSession(createRenderDocument(undefined, 64, 64));
    const snapshot = (): LiveDocumentSnapshot => ({
      documentId: 'project',
      revision: session.revision,
      document: session.document,
    });
    const first = asset(),
      input = args();
    const insertion = htmlPublishCommands(snapshot(), first, input);
    session.transaction(insertion.commands);
    session.execute({
      type: 'clip.patch',
      payload: {
        clipId: insertion.layerId,
        patch: { timelineStartMs: 500, transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } },
      },
    });
    const before = session.document.composition.clips[0];
    const second = { ...asset(), src: '/new.png' };
    session.transaction(htmlPublishCommands(snapshot(), second, { ...input, layerId: insertion.layerId }).commands);
    expect(session.document.composition.clips[0]).toEqual(before);
    expect(session.document.composition.assets).toHaveLength(1);
    expect(session.document.composition.assets[0]).toMatchObject({ id: first.id, src: '/new.png', html: second.html });
  });
  it('adds and updates a Screenshot layer through real engine validation', () => {
    const session = createAuthoringSession(createStillDocument('project', '/base.png', 64, 64));
    const snapshot = (): LiveDocumentSnapshot => ({
      documentId: 'project',
      revision: session.revision,
      document: session.document,
    });
    const first = asset();
    first.html = { ...(first.html as HtmlComposition), durationMs: 0 };
    const input = { ...args(), durationMs: 0 };
    const inserted = htmlPublishCommands(snapshot(), first, input);
    session.transaction(inserted.commands);
    const replacement = { ...first, src: '/new.png' };
    session.transaction(htmlPublishCommands(snapshot(), replacement, { ...input, layerId: inserted.layerId }).commands);
    expect(session.document.state.images).toHaveLength(1);
    expect(session.document.state.images?.[0]).toMatchObject({ id: inserted.layerId, source: '/new.png' });
    expect(() => htmlPublishCommands(snapshot(), first, { ...input, layerId: 'missing' })).toThrow('existing HTML');
    expect(() => htmlPublishCommands(snapshot(), first, { ...input, durationMs: 1 })).toThrow('durationMs');
  });
});
