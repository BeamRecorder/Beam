// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgentClient } from '../../../../cli/src/agent-client';
import type { AgentClient } from '../../../../cli/src/agent-types';

// Run only on an explicitly selected test desktop, with isolated content and preferences.
describe.skipIf(process.env.BEAM_RUN_DESKTOP_AGENT_TEST !== '1')('unified native Settings', () => {
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
    throw new Error(`Settings native gate timed out.\n${logs}`);
  };
  const targets = async (): Promise<Target[]> => (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const targetFor = async (fragment: string) => {
    let match: Target | undefined;
    await wait(async () => Boolean((match = (await targets()).find((target) => target.url.includes(fragment)))));
    return match!;
  };
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
  let hud: Awaited<ReturnType<typeof connect>>;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'beam-unified-settings-native-'));
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
    hud = await connect(await targetFor('/html/index.html'));
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

  const settingsTarget = async () => connect(await targetFor('panel=settings'));
  const openSettings = async (origin: Awaited<ReturnType<typeof connect>>, selector: string) => {
    await wait(() =>
      origin.evaluate(
        `Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`,
      ),
    );
    const start = Date.now();
    await origin.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await wait(async () => (await targets()).some((target) => target.url.includes('panel=settings')));
    const settings = await settingsTarget();
    await wait(() => settings.evaluate(`Boolean(document.querySelector('.settings-window nav'))`));
    return { settings, elapsed: Date.now() - start };
  };
  const category = async (settings: Awaited<ReturnType<typeof connect>>, name: string) => {
    await settings.evaluate(
      `Array.from(document.querySelectorAll('nav button')).find(button=>button.textContent.trim()===${JSON.stringify(name)}).click()`,
    );
  };
  const enterShortcut = async (settings: Awaited<ReturnType<typeof connect>>, key: string) => {
    await settings.evaluate(
      `(()=>{const button=document.querySelector('[data-setting="editor.selectAll"] button');button.focus();button.click();})()`,
    );
    await wait(() =>
      settings.evaluate(
        `document.querySelector('[data-setting="editor.selectAll"] button').getAttribute('aria-pressed')==='true'`,
      ),
    );
    for (const type of ['keyDown', 'keyUp']) {
      await settings.cdp('Input.dispatchKeyEvent', {
        type,
        key,
        code: `Key${key.toUpperCase()}`,
        modifiers: 2,
        windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
      });
    }
  };
  it('opens shared Settings and restores a remapped shortcut from a readable flat list', async () => {
    const { settings, elapsed } = await openSettings(hud, '[aria-label="Preferences"]');
    expect(elapsed).toBeLessThan(5000);
    expect(
      await settings.evaluate(`Array.from(document.querySelectorAll('nav h2')).map(item=>item.textContent.trim())`),
    ).toEqual(['Application', 'Tools']);
    expect(
      await settings.evaluate(
        `Array.from(document.querySelectorAll('nav [data-settings-view]')).slice(-2).map(item=>item.dataset.settingsView)`,
      ),
    ).toEqual(['updates', 'about']);
    await category(settings, 'Appearance');
    await wait(() => settings.evaluate(`document.body.textContent.includes('Theme')`));
    for (const theme of ['light', 'dark']) {
      await settings.evaluate(`window.capture.updatePreferences({theme:${JSON.stringify(theme)}})`);
      await new Promise((done) => setTimeout(done, 180));
      const screen = (await settings.cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await writeFile(`/tmp/beam-unified-appearance-${theme}.png`, Buffer.from(screen.data, 'base64'));
      await writeFile(`/tmp/beam-settings-groups-${theme}.png`, Buffer.from(screen.data, 'base64'));
      const navigation = await settings.evaluate<{
        bottom: number;
        height: number;
        width: number;
        scrollWidth: number;
      }>(`(()=>{
        const nav=document.querySelector('nav');
        return {bottom:document.querySelector('[data-settings-view="about"]').getBoundingClientRect().bottom,
          height:window.innerHeight, width:nav.clientWidth, scrollWidth:nav.scrollWidth};
      })()`);
      expect(navigation.bottom).toBeLessThanOrEqual(navigation.height);
      expect(navigation.scrollWidth).toBe(navigation.width);
    }
    await category(settings, 'Keyboard Shortcuts');
    await wait(() =>
      settings.evaluate(`Boolean(document.querySelector('[data-setting="editor.selectAll"] button:not(:disabled)'))`),
    );
    await new Promise((done) => setTimeout(done, 160));
    const screen = (await settings.cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await writeFile('/tmp/beam-unified-shortcuts.png', Buffer.from(screen.data, 'base64'));
    await enterShortcut(settings, 'k');
    await wait(
      async () =>
        (await settings.evaluate<{ shortcuts: Record<string, { keys: string }> }>('window.capture.getPreferences()'))
          .shortcuts['editor.selectAll']?.keys === 'Ctrl+K',
    );
    expect(
      await settings.evaluate(`Array.from(document.querySelectorAll('[role="alert"]')).map(item=>item.textContent)`),
    ).toEqual([]);
    await wait(() =>
      settings.evaluate(
        `Boolean(document.querySelector('[data-setting="editor.selectAll"] [aria-label="Restore default"]:not(:disabled)'))`,
      ),
    );
    await settings.evaluate('document.activeElement?.blur()');
    for (const theme of ['light', 'dark']) {
      await settings.evaluate(`window.capture.updatePreferences({theme:${JSON.stringify(theme)}})`);
      await new Promise((done) => setTimeout(done, 180));
      const appearance = await settings.evaluate<{
        color: number[];
        background: number[];
        keyBackground: string;
        buttonBackground: string;
      }>(
        `(()=>{
          const plus=document.querySelector('.chip-plus');
          let surface=plus;
          while(surface && getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)') surface=surface.parentElement;
          const rgb=color=>color.match(/[0-9.]+/g).slice(0,3).map(Number);
          return {
            color:rgb(getComputedStyle(plus).color),
            background:rgb(getComputedStyle(surface).backgroundColor),
            keyBackground:getComputedStyle(document.querySelector('.keyboard-chip')).backgroundColor,
            buttonBackground:getComputedStyle(document.querySelector('.shortcut-trigger button')).backgroundColor
          };
        })()`,
      );
      const luminance = (rgb: number[]) =>
        rgb
          .map((value) => value / 255)
          .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
          .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const foreground = luminance(appearance.color);
      const background = luminance(appearance.background);
      expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThan(
        4.5,
      );
      expect(appearance.keyBackground).not.toBe('rgba(0, 0, 0, 0)');
      expect(appearance.buttonBackground).toBe('rgba(0, 0, 0, 0)');
      const screen = (await settings.cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await writeFile(`/tmp/beam-shortcuts-flat-${theme}.png`, Buffer.from(screen.data, 'base64'));
    }
    await settings.evaluate(
      `document.querySelector('[data-setting="editor.selectAll"] [aria-label="Restore default"]').click()`,
    );
    await wait(
      async () =>
        (await settings.evaluate<{ shortcuts: Record<string, { keys: string }> }>('window.capture.getPreferences()'))
          .shortcuts['editor.selectAll']?.keys === 'CommandOrControl+A',
    );
    expect(
      await settings.evaluate(
        `Boolean(document.querySelector('[data-setting="editor.selectAll"] [aria-label="Restore default"]'))`,
      ),
    ).toBe(false);
    for (const confirm of [false, true]) {
      await enterShortcut(settings, 'c');
      await wait(() => settings.evaluate(`Boolean(document.querySelector('[role="dialog"]'))`));
      expect(await settings.evaluate(`document.querySelector('.confirm-description').textContent`)).toContain(
        'Copy selection',
      );
      expect(
        (await settings.evaluate<{ shortcuts: Record<string, { keys: string }> }>('window.capture.getPreferences()'))
          .shortcuts['editor.selectAll']?.keys,
      ).toBe('CommandOrControl+A');
      await new Promise((done) => setTimeout(done, 180));
      const screen = (await settings.cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await writeFile('/tmp/beam-shortcuts-reassign-dark.png', Buffer.from(screen.data, 'base64'));
      await settings.evaluate(`document.querySelector('.dialog-footer .btn-${confirm ? 'primary' : 'ghost'}').click()`);
      await wait(() => settings.evaluate(`!document.querySelector('[role="dialog"]')`));
    }
    const reassigned = await settings.evaluate<{ shortcuts: Record<string, { keys: string }> }>(
      'window.capture.getPreferences()',
    );
    expect(reassigned.shortcuts['editor.selectAll']?.keys).toBe('Ctrl+C');
    expect(reassigned.shortcuts['editor.copy']?.keys).toBe('');
    for (const id of ['editor.selectAll', 'editor.copy']) {
      await settings.evaluate(
        `document.querySelector('[data-setting="${id}"] [aria-label="Restore default"]').click()`,
      );
      await wait(() =>
        settings.evaluate(`!document.querySelector('[data-setting="${id}"] [aria-label="Restore default"]')`),
      );
    }
    await settings.evaluate('window.capture.close()');
  }, 60000);
  it.each(['screenshot', 'studio'])(
    'opens the same cached Settings from %s without replacing its inspector',
    async (mode) => {
      hud = await connect(await targetFor('/html/index.html'));
      const project = await hud.evaluate<{ id: string }>(
        `window.capture.createProject({name:'Settings ${mode}',mode:${JSON.stringify(mode)}})`,
      );
      await hud.evaluate(
        `window.capture.${mode === 'screenshot' ? 'openScreenshot' : 'openEditor'}(${JSON.stringify(project.id)})`,
      );
      const target = await targetFor('/html/editor.html');
      const editor = await connect(target);
      await wait(() => editor.evaluate(`Boolean(document.querySelector('[aria-label="Settings"]'))`));
      const inspector = await editor.evaluate(`document.querySelector('.screenshot-editor')?'screenshot':'video'`);
      expect(inspector).toBe(mode === 'screenshot' ? 'screenshot' : 'video');
      const { settings, elapsed } = await openSettings(editor, '[aria-label="Settings"]');
      expect(elapsed).toBeLessThan(3000);
      expect((await targets()).filter((target) => target.url.includes('panel=settings'))).toHaveLength(1);
      const context = await settings.evaluate<{ projectId: string }>('window.capture.getSettingsEditorContext()');
      expect(context.projectId).toBe(project.id);
      expect(await editor.evaluate(`Boolean(document.querySelector('[data-testid="editor-settings"]'))`)).toBe(false);
      const prefs = await settings.evaluate<{ shortcuts: Record<string, { keys: string }> }>(
        'window.capture.getPreferences()',
      );
      expect(prefs.shortcuts['editor.selectAll']?.keys).toBe('CommandOrControl+A');
      await settings.evaluate('window.capture.close()');
      if (process.platform !== 'win32')
        await wait(async () => !(await targets()).some((target) => target.url.includes('/html/index.html')));
      await editor.evaluate(`document.querySelector('[aria-label="Back to HUD"]').click()`);
    },
    60000,
  );
});
