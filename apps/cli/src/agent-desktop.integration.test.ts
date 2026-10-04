import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { callAgentTool } from './agent-tools';
import { createAgentClient } from './agent-client';
import { publishHtml, readLiveDocument } from './html-publish';
import type { AgentClient, PublishResult } from './agent-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { StillDocument } from '@beam/engine/screenshot/still-document-types';

// Explicit hardware/native-window gate. Regular targeted unit runs do not start a user's desktop.
describe.skipIf(process.env.BEAM_RUN_DESKTOP_AGENT_TEST !== '1')('real desktop agent authoring', () => {
  let root: string, server: ViteDevServer, process_: ChildProcess, client: AgentClient;
  let logs = '',
    video: { id: string },
    screenshot: { id: string },
    published: PublishResult,
    screenshotSource: string;
  const checkout = process.cwd();
  const wait = async (condition: () => Promise<boolean>, deadline = 30000) => {
    const until = Date.now() + deadline;
    while (Date.now() < until) {
      if (await condition()) return;
      if (process_?.exitCode !== null) throw new Error(`Electron exited.\n${logs}`);
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`Desktop gate timed out.\n${logs}`);
  };
  const call = <T = unknown>(tool: string, input: unknown) =>
    callAgentTool(tool, input, root, undefined, client) as Promise<T>;
  const render = async (tool: string, input: object) => {
    const result = await promisify(execFile)(
      process.execPath,
      [
        resolve(checkout, 'apps/cli/dist/index.mjs'),
        'tools',
        'call',
        tool,
        JSON.stringify(input),
        '--instance',
        String(process_.pid),
      ],
      { cwd: root, env: process.env, timeout: 60000 },
    );
    return JSON.parse(result.stdout);
  };
  const open = async (projectId: string, kind: 'video' | 'image') => {
    await call('projects.open', { projectId, kind });
    await wait(async () =>
      (await call<{ open: { projectId: string }[] }>('projects.list', {})).open.some(
        (document) => document.projectId === projectId,
      ),
    );
  };
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'beam-desktop-agent-'));
    await mkdir(join(root, 'composition'));
    await writeFile(
      join(root, 'composition/index.html'),
      '<html><body style="margin:0"><canvas width="64" height="64"></canvas><script type="module" src="./main.ts"></script></body></html>',
    );
    await writeFile(
      join(root, 'composition/main.ts'),
      `const canvas = document.querySelector('canvas')!;
      const gl = canvas.getContext('webgl', {preserveDrawingBuffer:true})!;
      if (!gl) throw new Error('WebGL unavailable');
      Object.assign(window,{beamComposition:{seek(timeMs:number){ gl.clearColor(timeMs<1000?1:0,0,timeMs<1000?0:1,1); gl.clear(gl.COLOR_BUFFER_BIT); }}});`,
    );
    server = await createServer({
      configFile: resolve(checkout, 'vite.config.ts'),
      cacheDir: join(root, 'vite-cache'),
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Missing Vite port.');
    const executable = createRequire(resolve(checkout, 'package.json'))('electron') as string;
    process_ = spawn(executable, [resolve(checkout, 'test/fixtures/agent-desktop-host.cjs'), '--ozone-platform=x11'], {
      cwd: checkout,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: undefined,
        BEAM_DEVELOPMENT_INSTANCE: undefined,
        BEAM_AGENT_TEST_ROOT: root,
        BEAM_DEV_SERVER_URL: `http://127.0.0.1:${address.port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [process_.stdout, process_.stderr])
      stream?.on('data', (chunk) => {
        logs = (logs + chunk).slice(-50000);
      });
    await wait(async () => {
      try {
        client = createAgentClient(process_.pid);
        await client.call('projects.list', {});
        return true;
      } catch {
        return false;
      }
    });
    video = await call('projects.create', { kind: 'video', name: 'Agent video test' });
    await open(video.id, 'video');
  }, 60000);
  afterAll(async () => {
    process_?.kill('SIGTERM');
    if (process_?.exitCode === null)
      await new Promise<void>((done) => {
        const timer = setTimeout(() => {
          process_.kill('SIGKILL');
          done();
        }, 10000);
        process_.once('exit', () => {
          clearTimeout(timer);
          done();
        });
      });
    await server?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });
  it('publishes HTML/TypeScript/WebGL into the open Studio and captures distinct timeline frames', async () => {
    const before = await readLiveDocument(client, video.id);
    published = await publishHtml(
      client,
      {
        projectId: video.id,
        expectedRevision: before.revision,
        entry: 'composition/index.html',
        width: 64,
        height: 64,
        durationMs: 2000,
      },
      root,
    );
    const after = await readLiveDocument(client, video.id);
    expect((after.document as CompositionSnapshot).composition.assets[0]?.html).toEqual(published.html);
    const render = await client.call<{ frameSources: { url: string }[] }>('documents.export', { projectId: video.id });
    const url = render.frameSources[0]!.url;
    const red = Buffer.from(await (await fetch(`${url}?timeMs=0`)).arrayBuffer());
    const blue = Buffer.from(await (await fetch(`${url}?timeMs=1500`)).arrayBuffer());
    const reverse = Buffer.from(await (await fetch(`${url}?timeMs=0`)).arrayBuffer());
    expect(red.subarray(1, 4).toString()).toBe('PNG');
    expect(red).not.toEqual(blue);
    expect(red).toEqual(reverse);
  }, 60000);
  it('updates the same clip, uses the visible editor history and rejects stale revisions', async () => {
    const before = await readLiveDocument(client, video.id);
    const revised = await publishHtml(
      client,
      {
        projectId: video.id,
        expectedRevision: before.revision,
        layerId: published.layerId,
        entry: 'composition/index.html',
        width: 64,
        height: 64,
        durationMs: 2000,
        name: 'Changed HTML',
      },
      root,
    );
    expect(revised.html.id).toBe(published.html.id);
    expect(revised.html.revision).not.toBe(published.html.revision);
    await expect(
      call('documents.transact', {
        projectId: video.id,
        expectedRevision: before.revision,
        operationId: 'stale',
        commands: [{ type: 'clip.patch', payload: { clipId: published.layerId, patch: { name: 'Overwrite' } } }],
      }),
    ).rejects.toThrow('revision-conflict');
    await call('documents.undo', { projectId: video.id, expectedRevision: revised.revision, requestId: 'undo-update' });
    const undo = await readLiveDocument(client, video.id);
    expect((undo.document as CompositionSnapshot).composition.assets[0]?.html?.revision).toBe(published.html.revision);
    await call('documents.redo', { projectId: video.id, expectedRevision: undo.revision, requestId: 'redo-update' });
    const redo = await readLiveDocument(client, video.id);
    expect((redo.document as CompositionSnapshot).composition.clips[0]?.name).toBe('Changed HTML');
  }, 60000);
  it('publishes a static Screenshot layer and exports its real rendered pixels', async () => {
    screenshot = await call('projects.create', { kind: 'image', name: 'Agent screenshot test', width: 64, height: 64 });
    await open(screenshot.id, 'image');
    const snapshot = await readLiveDocument(client, screenshot.id);
    const result = await publishHtml(
      client,
      {
        projectId: screenshot.id,
        expectedRevision: snapshot.revision,
        entry: 'composition/index.html',
        width: 64,
        height: 64,
        durationMs: 0,
      },
      root,
    );
    const after = await readLiveDocument(client, screenshot.id);
    expect((after.document as StillDocument).state.images?.[0]?.html).toEqual(result.html);
    screenshotSource = (after.document as StillDocument).state.images![0]!.source;
    await render('render.export', { projectId: screenshot.id, output: 'still.png' });
    const png = await readFile(join(root, 'still.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(64);
  }, 60000);
  it('exports the open video and a timeline frame using the packaged CLI', async () => {
    await open(video.id, 'video');
    await render('render.frame', { projectId: video.id, output: 'frame.png', timeMs: 1500 });
    const frame = await readFile(join(root, 'frame.png'));
    expect(frame.subarray(1, 4).toString()).toBe('PNG');
    await render('render.export', { projectId: video.id, output: 'video.webm', format: 'webm' });
    const videoBytes = await readFile(join(root, 'video.webm'));
    expect(videoBytes.length).toBeGreaterThan(1000);
    expect(videoBytes.subarray(0, 4).toString('hex')).toBe('1a45dfa3');
  }, 60000);
  it('watches TypeScript saves and republishes the same live layer without replacing it on a compiler error', async () => {
    const snapshot = await readLiveDocument(client, video.id);
    const file = join(root, 'watch.json');
    await writeFile(
      file,
      JSON.stringify({
        projectId: video.id,
        expectedRevision: snapshot.revision,
        layerId: published.layerId,
        entry: 'composition/index.html',
        width: 64,
        height: 64,
        durationMs: 2000,
      }),
    );
    const watcher = spawn(
      process.execPath,
      [resolve(checkout, 'apps/cli/dist/index.mjs'), 'html', 'watch', `@${file}`, '--instance', String(process_.pid)],
      { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '',
      errors = '';
    watcher.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    watcher.stderr?.on('data', (chunk) => {
      errors += chunk;
    });
    const count = () =>
      output
        .trim()
        .split('\n')
        .filter((line) => line.includes('html.published')).length;
    try {
      await wait(async () => count() === 1);
      const before = await readLiveDocument(client, video.id);
      const source = join(root, 'composition/main.ts');
      const code = await readFile(source, 'utf8');
      await writeFile(
        source,
        code.replace('gl.clearColor(timeMs<1000?1:0,0,timeMs<1000?0:1,1)', 'gl.clearColor(0,1,0,1)'),
      );
      await wait(async () => count() === 2);
      const after = await readLiveDocument(client, video.id);
      const clips = (after.document as CompositionSnapshot).composition.clips;
      expect(clips).toHaveLength(1);
      expect(clips[0]?.id).toBe(published.layerId);
      expect(after.revision).toBeGreaterThan(before.revision);
      await writeFile(source, 'invalid typescript ###');
      await wait(async () => errors.includes('html.error'));
      expect((await readLiveDocument(client, video.id)).revision).toBe(after.revision);
    } finally {
      watcher.kill('SIGTERM');
      if (watcher.exitCode === null)
        await new Promise<void>((done) => {
          const timer = setTimeout(() => {
            watcher.kill('SIGKILL');
            done();
          }, 10000);
          watcher.once('exit', () => {
            clearTimeout(timer);
            done();
          });
        });
    }
  }, 60000);
  it('resolves a reference from a closed Screenshot project and freezes it into the video source', async () => {
    const reference = await call<{ path: string }>('assets.resolve', {
      projectId: screenshot.id,
      source: screenshotSource,
    });
    expect((await readFile(reference.path)).subarray(1, 4).toString()).toBe('PNG');
    await expect(call('assets.resolve', { projectId: video.id, source: screenshotSource })).rejects.toThrow(
      'does not belong',
    );
    await writeFile(
      join(root, 'composition/main.ts'),
      `Object.assign(window,{beamComposition:{seek(timeMs:number){ document.body.dataset.time=String(timeMs); }}});`,
    );
    const snapshot = await readLiveDocument(client, video.id);
    const result = await publishHtml(
      client,
      {
        projectId: video.id,
        expectedRevision: snapshot.revision,
        layerId: published.layerId,
        entry: 'composition/index.html',
        width: 64,
        height: 64,
        durationMs: 2000,
        references: [{ name: 'feature.png', source: screenshotSource, projectId: screenshot.id }],
      },
      root,
    );
    const source = await call<{ directory: string }>('html.source', { projectId: video.id, html: result.html });
    const frozen = await readFile(join(source.directory, 'references/feature.png'));
    expect(frozen).toEqual(await readFile(reference.path));
  }, 60000);
});
