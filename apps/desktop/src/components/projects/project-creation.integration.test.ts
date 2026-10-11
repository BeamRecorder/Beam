// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgentClient } from '../../../../cli/src/agent-client';
import type { AgentClient } from '../../../../cli/src/agent-types';
import { readLiveDocument } from '../../../../cli/src/html-publish';
import type { StillDocument } from '@beam/engine/screenshot/still-document-types';

// Run only on an explicitly selected test desktop, with isolated content and preferences.
describe.skipIf(process.env.BEAM_RUN_DESKTOP_AGENT_TEST !== '1')('native New project dialog', () => {
  let root: string, server: ViteDevServer, desktop: ChildProcess, client: AgentClient;
  let logs = '',
    debugPort = '',
    counter = 0;
  const sockets: WebSocket[] = [];
  const checkout = process.cwd();
  type Target = { url: string; webSocketDebuggerUrl: string };
  const wait = async (condition: () => Promise<boolean>) => {
    const until = Date.now() + 40000;
    while (Date.now() < until) {
      if (await condition()) return;
      if (desktop?.exitCode !== null) throw new Error(`Desktop exited.\n${logs}`);
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`New project native gate timed out.\n${logs}`);
  };
  const targets = async (): Promise<Target[]> => (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const connect = async (target: Target) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    sockets.push(socket);
    await new Promise<void>((done, fail) => {
      socket.addEventListener('open', () => done(), { once: true });
      socket.addEventListener('error', () => fail(new Error('Inspector unavailable')), { once: true });
    });
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
    socket.addEventListener('message', (event) => {
      const reply = JSON.parse(String(event.data));
      const job = pending.get(reply.id);
      if (!job) return;
      pending.delete(reply.id);
      if (reply.error) job.reject(reply.error);
      else job.resolve(reply.result);
    });
    socket.addEventListener('close', () => {
      for (const job of pending.values()) job.reject(new Error('Inspector closed'));
      pending.clear();
    });
    const cdp = (method: string, params: object) =>
      new Promise<unknown>((resolveCall, reject) => {
        const id = ++counter;
        pending.set(id, { resolve: resolveCall, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async <T = unknown>(expression: string): Promise<T> => {
      const result = (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
        exceptionDetails?: unknown;
        result: { value: T };
      };
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    return { cdp, evaluate };
  };
  let hud: Awaited<ReturnType<typeof connect>>, projects: Awaited<ReturnType<typeof connect>>;
  const openDialog = async () => {
    // Returning from an editor may replace the idle HUD's Chromium document.
    await wait(async () => {
      const target = (await targets()).find((target) => target.url.includes('/html/index.html'));
      if (!target) return false;
      try {
        const candidate = await connect(target);
        if (!(await candidate.evaluate(`Boolean(document.querySelector('.hud-topbar'))`))) return false;
        hud = candidate;
        return true;
      } catch {
        // The standby target may disappear while the live HUD is being restored.
        return false;
      }
    });
    await hud.evaluate('window.capture.openHudProjects()');
    await wait(async () => (await targets()).some((target) => target.url.includes('panel=projects')));
    projects = await connect((await targets()).find((target) => target.url.includes('panel=projects'))!);
    await wait(() => projects.evaluate(`Boolean(document.querySelector('[aria-label="New project"]'))`));
    await projects.evaluate(`document.querySelector('[aria-label="New project"]').click()`);
    await wait(() => projects.evaluate(`Boolean(document.querySelector('.project-create input:not(:disabled)'))`));
    await new Promise((done) => setTimeout(done, 300));
  };
  const create = async (name: string) => {
    await hud.evaluate(`(() => {
      window.__beamEditorPresented = false;
      window.capture.onEditorLoadingProgress(progress => {
        if (progress.stage === 'ready') window.__beamEditorPresented = true;
      });
    })()`);
    await projects.evaluate(`(() => {
      const input = document.querySelector('.project-create input');
      input.value = ${JSON.stringify(name)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.project-create').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`);
    await wait(() => hud.evaluate('window.__beamEditorPresented === true'));
    await wait(async () =>
      (await client.call<{ open: { name: string }[] }>('projects.list', {})).open.some((item) => item.name === name),
    );
    return (
      await client.call<{ open: { projectId: string; name: string; kind: string }[] }>('projects.list', {})
    ).open.find((item) => item.name === name)!;
  };
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'beam-new-project-native-'));
    server = await createServer({
      configFile: resolve(checkout, 'vite.config.ts'),
      cacheDir: join(root, 'vite-cache'),
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Missing renderer port');
    const executable = createRequire(resolve(checkout, 'package.json'))('electron') as string;
    desktop = spawn(
      executable,
      [
        resolve(checkout, 'test/fixtures/agent-desktop-host.cjs'),
        '--ozone-platform=x11',
        '--remote-debugging-port=0',
        '--lang=en-US',
      ],
      {
        cwd: checkout,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: undefined,
          BEAM_DEVELOPMENT_INSTANCE: undefined,
          BEAM_AGENT_TEST_ROOT: root,
          BEAM_DEV_SERVER_URL: `http://127.0.0.1:${address.port}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    for (const stream of [desktop.stdout, desktop.stderr])
      stream?.on('data', (chunk) => {
        logs = (logs + chunk).slice(-50000);
      });
    await wait(async () => {
      try {
        client = createAgentClient(desktop.pid);
        await client.call('projects.list', {});
        return true;
      } catch {
        return false;
      }
    });
    debugPort = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(logs)?.[1] ?? '';
    if (!debugPort) throw new Error('Missing inspector');
    hud = await connect((await targets()).find((target) => target.url.includes('/html/index.html'))!);
    await hud.evaluate(`localStorage.setItem('locale', 'en')`);
  }, 60000);
  afterAll(async () => {
    for (const socket of sockets) socket.close();
    desktop?.kill('SIGTERM');
    if (desktop?.exitCode === null)
      await new Promise<void>((done) => {
        const timer = setTimeout(() => {
          desktop.kill('SIGKILL');
          done();
        }, 5000);
        desktop.once('exit', () => {
          clearTimeout(timer);
          done();
        });
      });
    await server?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });
  it('creates an editable Screenshot from the real Projects dialog and saves the last choice', async () => {
    await openDialog();
    expect(
      await projects.evaluate(
        `Array.from(document.querySelectorAll('.project-create [role="group"] button')).map(button => button.textContent.trim())`,
      ),
    ).toEqual(['Video', 'Screenshot']);
    await projects.evaluate(`document.querySelector('.project-create [aria-label="Screenshot"]').click()`);
    await wait(() => projects.evaluate(`Boolean(document.querySelector('.project-create input:not(:disabled)'))`));
    const screen = (await projects.cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await writeFile('/tmp/beam-new-project-dialog.png', Buffer.from(screen.data, 'base64'));
    const project = await create('Screenshot from New project');
    expect(project.kind).toBe('image');
    const { document } = await readLiveDocument(client, project.projectId);
    expect((document as StillDocument).state.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect((document as StillDocument).state.shapes).toEqual([]);
    const preferences = JSON.parse(await readFile(join(root, 'videos/Beam/user/preferences.json'), 'utf8'));
    expect(preferences.extras.newProjectMode).toBe('screenshot');
    const editor = await connect((await targets()).find((target) => target.url.includes('/html/editor.html'))!);
    expect(await editor.evaluate(`Boolean(document.querySelector('.screenshot-editor'))`)).toBe(true);
    expect(
      await editor.evaluate(`Array.from(document.querySelectorAll('[role="alert"]')).map(item => item.textContent)`),
    ).toEqual([]);
    // Exercise restoration after the hidden HUD has released its document.
    if (process.platform !== 'win32')
      await wait(async () => !(await targets()).some((target) => target.url.includes('/html/index.html')));
    await editor.evaluate(`document.querySelector('[aria-label="Back to HUD"]').click()`);
  }, 60000);
  it('restores Screenshot on reopening and opens the Video editor after switching back', async () => {
    await openDialog();
    expect(
      await projects.evaluate(
        `document.querySelector('.project-create [aria-label="Screenshot"]').getAttribute('aria-pressed')`,
      ),
    ).toBe('true');
    await projects.evaluate(`document.querySelector('.project-create [aria-label="Video"]').click()`);
    await wait(() => projects.evaluate(`Boolean(document.querySelector('.project-create input:not(:disabled)'))`));
    const project = await create('Video from New project');
    expect(project.kind).toBe('video');
    const preferences = JSON.parse(await readFile(join(root, 'videos/Beam/user/preferences.json'), 'utf8'));
    expect(preferences.extras.newProjectMode).toBe('studio');
  }, 60000);
});
