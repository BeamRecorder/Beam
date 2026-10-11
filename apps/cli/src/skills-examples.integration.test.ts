// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { chromiumExecutable } from './chromium-install';
import { buildMotionBundle } from './motion-bundle';
import { serveRenderBundle } from './bundle-server';
import { createMotionPage } from './motion-page';
import { createAuthoringSession, createRenderDocument } from '@beam/engine';
import { colorClip } from '../../../packages/engine/src/scene/tests/scene-fixtures';
import type { DocumentCommand } from '@beam/engine';

it('renders the shipped HTML example and reproduces identical frames after reverse and repeated seeking', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'beam-skill-example-'));
  const entry = resolve('.skills/Beam-cli/beam-composition/assets/html/index.html');
  const files = await buildMotionBundle(entry, join(directory, 'bundle'));
  const server = await serveRenderBundle(files, async (_request, _response, next) => next());
  const browser = await puppeteer.launch({
    executablePath: await chromiumExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const errors: Error[] = [];
    const context = await browser.createBrowserContext();
    const page = await createMotionPage(
      context,
      server.origin,
      { entry, width: 640, height: 360, assetId: 'example' },
      (error) => errors.push(error),
    );
    const middle = Buffer.from(await page.frame(2000));
    const entryFrame = Buffer.from(await page.frame(350));
    const ending = Buffer.from(await page.frame(5800));
    expect(middle.equals(entryFrame)).toBe(false);
    expect(middle.equals(ending)).toBe(false);
    expect(Buffer.from(await page.frame(2000)).equals(middle)).toBe(true);
    await page.frame(0);
    expect(Buffer.from(await page.frame(2000)).equals(middle)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

it('executes the native animation and editing command examples against the real engine', async () => {
  const root = resolve('.skills/Beam-cli');
  const extract = async (file: string) => {
    const source = await readFile(join(root, file), 'utf8');
    const block = /```json\n([\s\S]*?)\n```/.exec(source)?.[1];
    if (!block) throw new Error('Missing JSON example.');
    return JSON.parse(block.replaceAll('CLIP_ID', 'clip')) as DocumentCommand | DocumentCommand[];
  };
  const session = createAuthoringSession(createRenderDocument(undefined, 1280, 720, 30));
  session.execute({
    type: 'clip.add',
    payload: { ...colorClip('clip'), timelineDurationMs: 6000, sourceDurationMs: 6000 },
  });
  session.execute((await extract('beam-animation/references/clocks.md')) as DocumentCommand);
  session.transaction((await extract('beam-video-editor/SKILL.md')) as DocumentCommand[]);
  expect(session.document.composition.animations?.tracks[0]?.targetId).toBe('clip');
  expect(session.document.composition.clips[0]?.playbackRate).toBe(1.25);
});
