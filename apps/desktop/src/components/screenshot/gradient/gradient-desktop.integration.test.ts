// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElementText } from '@beam/engine/shared/element-text';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createAgentClient } from '../../../../../cli/src/agent-client';
import { callAgentTool } from '../../../../../cli/src/agent-tools';
import type { AgentClient } from '../../../../../cli/src/agent-types';
import type { StillDocument } from '@beam/engine/screenshot/still-document-types';
import type { GradientLayerEffect } from '@beam/engine/gradient/gradient-types';

// Explicit native-window gate: launch an isolated desktop, never the user's saved projects.
describe.skipIf(process.env.BEAM_RUN_DESKTOP_AGENT_TEST !== '1')('Screenshot gradient native gate', () => {
  let root: string,
    server: ViteDevServer,
    desktop: ChildProcess,
    client: AgentClient,
    projectId: string,
    connection: WebSocket;
  let logs = '',
    counter = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const checkout = process.cwd();
  const wait = async (condition: () => Promise<boolean>) => {
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      if (await condition()) return;
      if (desktop?.exitCode !== null) throw new Error(logs);
      await new Promise((done) => setTimeout(done, 100));
    }
    if (connection?.readyState === WebSocket.OPEN) {
      const screen = (await cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await writeFile('/tmp/beam-native-failure.png', Buffer.from(screen.data, 'base64'));
      const debug = await evaluate(
        `({canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,parent:c.parentElement.className,pixel:[...c.getContext('2d').getImageData(20,20,1,1).data]})),errors:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)})`,
      );
      await writeFile('/tmp/beam-native-failure.json', JSON.stringify(debug));
    }
    throw new Error(`Gradient gate timed out.\n${logs}`);
  };
  const call = <T = unknown>(tool: string, input: unknown) =>
    callAgentTool(tool, input, root, undefined, client) as Promise<T>;
  const snapshot = () => call<{ revision: number; document: StillDocument }>('documents.snapshot', { projectId });
  const effect = async () =>
    (await snapshot()).document.state.composition!.find((layer) => layer.id === '__background__')!.effects?.[0] as
      | GradientLayerEffect
      | undefined;
  const cdp = (method: string, params: unknown) =>
    new Promise<unknown>((resolveCall, reject) => {
      const id = ++counter;
      pending.set(id, { resolve: resolveCall, reject });
      connection.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const result = (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
      exceptionDetails?: { text: string };
      result: { value: T };
    };
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'beam-gradient-desktop-'));
    server = await createServer({
      configFile: resolve(checkout, 'vite.config.ts'),
      cacheDir: join(root, 'vite-cache'),
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Missing renderer port.');
    const executable = createRequire(resolve(checkout, 'package.json'))('electron') as string;
    desktop = spawn(
      executable,
      [resolve(checkout, 'test/fixtures/agent-desktop-host.cjs'), '--ozone-platform=x11', '--remote-debugging-port=0'],
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
    const project = await call<{ id: string }>('projects.create', {
      kind: 'image',
      name: 'Gradient native test',
      width: 1280,
      height: 720,
    });
    projectId = project.id;
    await call('projects.open', { projectId, kind: 'image' });
    await wait(async () =>
      (await call<{ open: { projectId: string }[] }>('projects.list', {})).open.some(
        (item) => item.projectId === projectId,
      ),
    );
    const before = await snapshot();
    await call('documents.transact', {
      projectId,
      expectedRevision: before.revision,
      operationId: 'white-canvas',
      commands: [
        { type: 'still.layer.enable', payload: { layerId: '__background__', enabled: true } },
        { type: 'still.layer.enable', payload: { layerId: before.document.state.image.id, enabled: false } },
        { type: 'still.background.set', payload: { kind: 'color', id: 'test', name: 'White', color: '#ffffff' } },
      ],
    });
    const debug = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(logs);
    if (!debug) throw new Error(`Missing inspector.\n${logs}`);
    const targets = (await (await fetch(`http://127.0.0.1:${debug[1]}/json/list`)).json()) as {
      url: string;
      webSocketDebuggerUrl: string;
    }[];
    const target = targets.find((item) => item.url.includes('/html/editor.html'));
    if (!target) throw new Error('Missing screenshot renderer.');
    connection = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => {
      connection.addEventListener('open', () => done(), { once: true });
      connection.addEventListener('error', () => reject(new Error('Inspector connection failed.')), { once: true });
    });
    connection.addEventListener('message', (event) => {
      const result = JSON.parse(String(event.data)) as { id: number; result: unknown; error?: { message: string } };
      const job = pending.get(result.id);
      if (!job) return;
      pending.delete(result.id);
      if (result.error) job.reject(new Error(result.error.message));
      else job.resolve(result.result);
    });
    await wait(() =>
      evaluate<boolean>(`Boolean(document.querySelector('[data-layer-id="__background__"] .layer-select'))`),
    );
  }, 60000);
  afterAll(async () => {
    connection?.close();
    for (const job of pending.values()) job.reject(new Error('Inspector closed.'));
    pending.clear();
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
  it('confines inspector blur to the panel and leaves the adjacent canvas sharp in both themes', async () => {
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('#screenshot-properties-panel'))`));
    for (const dark of [false, true]) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`);
      const surface = await evaluate<{ blur: string; gutter: string; overflow: string; radius: number }>(`(() => {
        const panel = document.querySelector('#screenshot-properties-panel');
        return { blur: getComputedStyle(panel, '::before').backdropFilter, gutter: getComputedStyle(panel, '::after').content, overflow: getComputedStyle(panel).overflow, radius: parseFloat(getComputedStyle(panel).borderTopLeftRadius) };
      })()`);
      expect(surface.blur).toBe('blur(12px)');
      expect(surface.gutter).toBe('none');
      expect(surface.overflow).toBe('hidden');
      expect(surface.radius).toBeGreaterThan(0);
    }
  });
  it('adds the effect from Composition, renders real pixels and switches a BEBE-ui preset', async () => {
    await evaluate(`document.querySelector('[data-layer-id="__background__"] .layer-select').click()`);
    await evaluate(`document.querySelector('[data-effect-menu="effects"]').click()`);
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('.menu-item'))`));
    await evaluate(`document.querySelector('.menu-item').click()`);
    await wait(async () => Boolean(await effect()));
    expect((await effect())!.recipe.seed).toBe(12);
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('.gradient-panel'))`));
    await wait(() =>
      evaluate<boolean>(
        `(()=>{const canvas=document.querySelector('.screenshot-stage canvas');const context=canvas.getContext('2d');const a=context.getImageData(20,20,1,1).data,b=context.getImageData(canvas.width-20,canvas.height-20,1,1).data;return a[0]!==b[0] || a[1]!==b[1] || a[2]!==b[2]})()`,
      ),
    );
    const pixels = await evaluate<number[]>(
      `(()=>{const canvas=document.querySelector('.screenshot-stage canvas');const context=canvas.getContext('2d');const a=Array.from(context.getImageData(20,20,1,1).data);const b=Array.from(context.getImageData(canvas.width-20,canvas.height-20,1,1).data);return [...a,...b]})()`,
    );
    expect(pixels.slice(0, 3)).not.toEqual(pixels.slice(4, 7));
    expect(pixels[3]).toBe(255);
    expect(pixels[7]).toBe(255);
    await wait(() =>
      evaluate<boolean>(`(()=>{
      const thumbnail=document.querySelector('[data-layer-id="__background__"] .effect-select .layer-thumbnail');
      const error=thumbnail.querySelector('svg');if(error)throw new Error(error.getAttribute('title'));
      return Boolean(thumbnail.querySelector('img.loaded'));
    })()`),
    );
    await wait(() =>
      evaluate<boolean>(
        `(()=>{const c=document.querySelector('.gradient-live-preview canvas');return Boolean(c&&!c.hidden&&c.getContext('2d').getImageData(20,20,1,1).data[3]===255)})()`,
      ),
    );
    const screen = (await cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await writeFile('/tmp/beam-gradient-editor.png', Buffer.from(screen.data, 'base64'));
    await evaluate(
      `Array.from(document.querySelectorAll('.gradient-panel button')).find(button=>button.textContent.includes('Bloom')).click()`,
    );
    await wait(async () => (await effect())?.recipe.seed === 8);
    expect((await effect())!.recipe.mode).toBe('silk');
  }, 60000);
  it('preserves partially transparent alpha in all blend modes and the translated thumbnail frame', async () => {
    const result = await evaluate<{ inside: number[]; outside: number[] }[]>(`(async()=>{
      const {drawWithLayerEffects,releaseLayerEffects}=await import('/@fs/${checkout}/packages/runtime/src/gradient/layer-effects.ts');
      const {createGradientEffect}=await import('/@fs/${checkout}/packages/engine/src/gradient/gradient-presets.ts');
      const results=[];
      for(const blendMode of ['source-over','overlay','soft-light','color']){
        const canvas=new OffscreenCanvas(128,64),ctx=canvas.getContext('2d');ctx.translate(7,3);
        const effect={...createGradientEffect('x'),blendMode,opacity:35};
        drawWithLayerEffects(ctx,[effect],{x:10,y:8,width:80,height:40},1,target=>{target.fillStyle='rgba(120,80,40,0.25)';target.fillRect(10,8,80,40);});
        results.push({inside:Array.from(ctx.getImageData(40,30,1,1).data),outside:Array.from(ctx.getImageData(2,2,1,1).data)});releaseLayerEffects(ctx);
      }return results;})()`);
    for (const value of result) {
      expect(value.inside[3]).toBeGreaterThanOrEqual(63);
      expect(value.inside[3]).toBeLessThanOrEqual(65);
      expect(value.outside[3]).toBe(0);
    }
  }, 60000);
  it('exports through the packaged CLI and retains the recipe in desktop history and saved JSON', async () => {
    const exported = join(root, 'gradient.png');
    await promisify(execFile)(
      process.execPath,
      [
        resolve(checkout, 'apps/cli/dist/index.mjs'),
        'tools',
        'call',
        'render.export',
        JSON.stringify({ projectId, output: exported }),
        '--instance',
        String(desktop.pid),
      ],
      { cwd: root, env: process.env, timeout: 60000 },
    );
    const png = await readFile(exported);
    expect(png.readUInt32BE(16)).toBe(1280);
    expect(png.readUInt32BE(20)).toBe(720);
    await writeFile('/tmp/beam-gradient-export.png', png);
    const current = await snapshot();
    await call('documents.undo', { projectId, expectedRevision: current.revision, requestId: 'undo-preset' });
    expect((await effect())!.recipe.seed).toBe(12);
    const undo = await snapshot();
    await call('documents.redo', { projectId, expectedRevision: undo.revision, requestId: 'redo-preset' });
    expect((await effect())!.recipe.seed).toBe(8);
    const saved = JSON.parse(
      await readFile(join(root, 'videos/Beam/user/projects/screenshot', projectId, 'screenshot.json'), 'utf8'),
    );
    expect(
      saved.state.composition.find((layer: { id: string }) => layer.id === '__background__').effects[0].recipe.seed,
    ).toBe(8);
  }, 60000);
  it('adds monochrome from the Color menu, aligns precise opacity and keeps frosted backgrounds behind content', async () => {
    await evaluate(`document.querySelector('[data-effect-menu="color"]').click()`);
    await wait(() =>
      evaluate<boolean>(
        `Array.from(document.querySelectorAll('.menu-item')).some(button=>button.textContent.includes('Black and white'))`,
      ),
    );
    await evaluate(
      `Array.from(document.querySelectorAll('.menu-item')).find(button=>button.textContent.includes('Black and white')).click()`,
    );
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('.color-panel'))`));
    const document = (await snapshot()).document;
    const effects = document.state.composition!.find((layer) => layer.id === '__background__')!.effects!;
    expect(effects).toHaveLength(2);
    expect(effects[1]).toMatchObject({ kind: 'color-adjustment', recipe: { grayscale: 100 } });
    await wait(() =>
      evaluate<boolean>(
        `(()=>{const canvas=document.querySelector('.screenshot-stage canvas');const p=canvas.getContext('2d').getImageData(20,20,1,1).data;return p[0]===p[1]&&p[1]===p[2]})()`,
      ),
    );
    const controls = await evaluate<{
      difference: number;
      height: number;
      parentBlur: string;
      backgroundBlur: string;
      background: string;
    }>(`(()=>{
      const row=document.querySelector('.composition-content .compositing-controls'),select=row.querySelector('.select-trigger'),opacity=row.querySelector('.input-wrapper');
      const a=select.getBoundingClientRect(),b=opacity.getBoundingClientRect(),panel=document.querySelector('#screenshot-properties-panel');
      return {difference:Math.abs(a.top-b.top),height:Math.abs(a.height-b.height),parentBlur:getComputedStyle(panel).backdropFilter,backgroundBlur:getComputedStyle(panel,'::before').backdropFilter,background:getComputedStyle(panel).backgroundColor};
    })()`);
    expect(controls.difference).toBeLessThan(1);
    expect(controls.height).toBeLessThan(1);
    expect(controls.parentBlur).toBe('none');
    expect(controls.backgroundBlur).toBe('blur(12px)');
    expect(controls.background).toBe('rgba(0, 0, 0, 0)');
    const current = await snapshot();
    await call('documents.undo', { projectId, expectedRevision: current.revision, requestId: 'undo-color' });
    expect(
      (await snapshot()).document.state.composition!.find((layer) => layer.id === '__background__')!.effects,
    ).toHaveLength(1);
    const undo = await snapshot();
    await call('documents.redo', { projectId, expectedRevision: undo.revision, requestId: 'redo-color' });
    expect(
      (await snapshot()).document.state.composition!.find((layer) => layer.id === '__background__')!.effects?.[1],
    ).toMatchObject({ kind: 'color-adjustment', recipe: { grayscale: 100 } });
    const screen = (await cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await writeFile('/tmp/beam-effects-editor.png', Buffer.from(screen.data, 'base64'));
    const output = join(root, 'monochrome.png');
    await call('render.export', { projectId, output });
    const png = await readFile(output);
    const pixels = await evaluate<number[]>(
      `(async()=>{const blob=await(await fetch('data:image/png;base64,${png.toString('base64')}')).blob(),image=await createImageBitmap(blob),canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();return Array.from(ctx.getImageData(20,20,1,1).data);})()`,
    );
    expect(pixels[0]).toBe(pixels[1]);
    expect(pixels[1]).toBe(pixels[2]);
    expect(pixels[3]).toBe(255);
  }, 60000);
  it('applies hue and monochrome to translucent pixels without thickening their alpha', async () => {
    const pixels = await evaluate<number[][]>(`(async()=>{
      const {drawWithLayerEffects,releaseLayerEffects}=await import('/@fs/${checkout}/packages/runtime/src/gradient/layer-effects.ts');
      const {createColorEffect}=await import('/@fs/${checkout}/packages/engine/src/gradient/color-schema.js');
      const results=[];
      for(const opacity of [35,100]){const canvas=new OffscreenCanvas(32,32),ctx=canvas.getContext('2d'),effect={...createColorEffect('mono',true),opacity};
        drawWithLayerEffects(ctx,[effect],{x:0,y:0,width:32,height:32},1,target=>{target.fillStyle='rgba(255,0,0,0.25)';target.fillRect(0,0,32,32);});results.push(Array.from(ctx.getImageData(12,12,1,1).data));releaseLayerEffects(ctx);}
      return results;})()`);
    for (const pixel of pixels) expect(pixel[3]).toBeGreaterThanOrEqual(63);
    for (const pixel of pixels) expect(pixel[3]).toBeLessThanOrEqual(65);
    expect(pixels[0]![0]).toBeGreaterThan(pixels[0]![1]!);
    expect(pixels[1]![0]).toBe(pixels[1]![1]);
    expect(pixels[1]![1]).toBe(pixels[1]![2]);
  }, 60000);
  it('imports fonts for native text, updates the inspector and exports their exact portable source', async () => {
    const source = resolve(checkout, 'public/font/HankenGrotesk-VariableFont_wght.ttf');
    const font = await call<{ id: string; family: string; url: string }>('fonts.import', { source });
    expect(await call('fonts.import', { source })).toEqual(font);
    expect(await call<{ id: string }[]>('fonts.list', {})).toContainEqual(font);
    await expect(client.call('fonts.import', { source: 'relative.ttf' })).rejects.toThrow('absolute');
    await writeFile(join(root, 'broken.ttf'), 'invalid bytes');
    await expect(call('fonts.import', { source: join(root, 'broken.ttf') })).rejects.toThrow('invalide');
    const text = createElementText('Beam');
    Object.assign(text.style, {
      fontFamily: font.family,
      fontAssetId: font.id,
      fontSize: 60,
      color: '#ff3300',
      wrap: false,
    });
    text.padding = 0;
    const current = await snapshot();
    await call('documents.transact', {
      projectId,
      expectedRevision: current.revision,
      operationId: 'native-font-text',
      commands: [
        {
          type: 'still.layer.add',
          payload: {
            id: 'native-text',
            name: 'Editable Beam',
            kind: 'shape',
            trackId: 'text',
            assetId: '',
            timelineStartMs: 0,
            timelineDurationMs: 1,
            sourceInMs: 0,
            sourceDurationMs: 1,
            playbackRate: 1,
            transitions: { entry: null, exit: null },
            enabled: true,
            order: 0,
            ...DEFAULT_SHAPE_LAYER_STYLE,
            family: 'text',
            preset: 'text',
            fillEnabled: false,
            transform: { x: 0.6, y: 0.3, width: 0.2, height: 0.2 },
            text,
          },
        },
      ],
    });
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('[data-layer-id="native-text"]'))`));
    await evaluate(`document.querySelector('[data-layer-id="native-text"] .layer-select').click()`);
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('.element-text-controls textarea'))`));
    await wait(() =>
      evaluate<boolean>(`Boolean(document.querySelector('[data-element-section="typography"] .accordion-trigger'))`),
    );
    expect(
      await evaluate(
        `document.querySelector('[data-element-section="typography"] .accordion-trigger').getAttribute('aria-expanded')`,
      ),
    ).toBe('true');
    await evaluate(
      `(()=>{const field=document.querySelector('.element-text-controls textarea');field.value='Beam Studio';field.dispatchEvent(new Event('input',{bubbles:true}));field.blur()})()`,
    );
    await wait(async () => (await snapshot()).document.state.shapes[0]?.text?.content === 'Beam Studio');
    const next = await snapshot();
    expect(next.document.fontSources).toEqual({ [font.id]: font.url });
    const portable = await client.call<{ document: StillDocument }>('documents.export', { projectId });
    expect(portable.document.fontSources![font.id]).toMatch(/^file:\/\//);
    const output = join(root, 'native-text.png');
    await call('render.export', { projectId, output });
    expect((await readFile(output)).readUInt32BE(16)).toBe(1280);
    await evaluate(`document.documentElement.classList.remove('dark')`);
    const appearance = await evaluate<{
      sliderBorder: number;
      buttonBorder: number;
      transparency: string;
      blur: string;
      overlay: string;
      overlap: boolean;
    }>(`(()=>{
      const panel=document.querySelector('#screenshot-properties-panel'),canvas=document.querySelector('.screenshot-stage'),slider=panel.querySelector('.big-slider-container'),button=document.querySelector('.screenshot-toolbar .btn-secondary');
      const a=panel.getBoundingClientRect(),b=canvas.getBoundingClientRect();
      return { sliderBorder:parseFloat(getComputedStyle(slider).borderTopWidth),buttonBorder:parseFloat(getComputedStyle(button).borderTopWidth),transparency:getComputedStyle(panel,'::before').backgroundColor,blur:getComputedStyle(panel,'::before').backdropFilter,overlay:getComputedStyle(panel).position,overlap:a.right>b.left&&a.left<b.right };
    })()`);
    expect(appearance.sliderBorder).toBe(1);
    expect(appearance.buttonBorder).toBe(1);
    expect(appearance.transparency).toContain('0.86');
    expect(appearance.blur).toBe('blur(12px)');
    expect(
      await evaluate("getComputedStyle(document.querySelector('#screenshot-properties-panel'),'::after').content"),
    ).toBe('none');
    expect(await evaluate("getComputedStyle(document.querySelector('#screenshot-properties-panel')).overflow")).toBe(
      'hidden',
    );
    expect(appearance.overlay).toBe('absolute');
    expect(appearance.overlap).toBe(true);
    const screen = (await cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await writeFile('/tmp/beam-inspector-light.png', Buffer.from(screen.data, 'base64'));
  }, 60000);
  it('scrolls Composition independently and deselects or opens Add on empty canvas space', async () => {
    const current = await snapshot(),
      shape = current.document.state.shapes[0]!;
    await call('documents.transact', {
      projectId,
      expectedRevision: current.revision,
      operationId: 'scroll-many-layers',
      commands: Array.from({ length: 15 }, (_, index) => ({
        type: 'still.layer.add',
        payload: {
          ...shape,
          id: 'scroll-' + index,
          name: 'Layer ' + index,
          transform: { x: 0.9, y: 0.9, width: 0.05, height: 0.05 },
        },
      })),
    });
    await wait(() => evaluate<boolean>(`document.querySelectorAll('.layer-row').length>=18`));
    const dimensions = await evaluate<{ scroll: number; height: number; top: number }>(
      `(()=>{const list=document.querySelector('.layer-list');list.scrollTop=150;return {scroll:list.scrollHeight,height:list.clientHeight,top:list.scrollTop}})()`,
    );
    expect(dimensions.scroll).toBeGreaterThan(dimensions.height);
    expect(dimensions.top).toBe(150);
    const point = await evaluate<{ x: number; y: number }>(
      `(()=>{const r=document.querySelector('.layer-list').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
    );
    const size = await evaluate(`document.querySelector('.screenshot-stage canvas').getBoundingClientRect().width`);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: 120 });
    await wait(() => evaluate<boolean>(`document.querySelector('.layer-list').scrollTop>150`));
    expect(await evaluate(`document.querySelector('.screenshot-stage canvas').getBoundingClientRect().width`)).toBe(
      size,
    );
    await evaluate(
      `(()=>{const bounds=document.querySelector('.stage-bounds'),canvas=document.querySelector('.screenshot-stage canvas'),r=canvas.getBoundingClientRect();bounds.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,clientX:r.left+r.width*.5,clientY:r.top+r.height*.5}))})()`,
    );
    await wait(() => evaluate<boolean>(`document.querySelectorAll('.layer-row.selected').length===0`));
    await evaluate(
      `(()=>{const canvas=document.querySelector('.screenshot-stage canvas'),r=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('dblclick',{button:0,bubbles:true,clientX:r.left+r.width*.5,clientY:r.top+r.height*.5}))})()`,
    );
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('.context-menu-surface .menu-item'))`));
    expect(await evaluate(`document.querySelector('.context-menu-surface').textContent`)).toContain('Elements');
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  }, 60000);
  it('projects translucent layers with the real GPU and persists native text perspective through CLI export', async () => {
    const pixels = await evaluate<number[][]>(`(async()=>{
      const {drawWithLayerPerspective,releaseLayerPerspective}=await import('/@fs/${checkout}/packages/runtime/src/composition/render-layer-perspective.ts');
      const canvas=new OffscreenCanvas(320,240),ctx=canvas.getContext('2d');
      drawWithLayerPerspective(ctx,{x:32,y:-18,perspective:1200},{x:80,y:60,width:160,height:120},1,target=>{target.fillStyle='rgba(255,0,0,.25)';target.fillRect(80,60,160,120)});
      const results=[[...ctx.getImageData(160,120,1,1).data],[...ctx.getImageData(10,10,1,1).data]];releaseLayerPerspective(ctx);return results;
    })()`);
    expect(pixels[0]![0]).toBeGreaterThan(250);
    expect(pixels[0]![3]).toBeGreaterThanOrEqual(63);
    expect(pixels[0]![3]).toBeLessThanOrEqual(65);
    expect(pixels[1]![3]).toBe(0);
    const current = await snapshot();
    await call('documents.transact', {
      projectId,
      expectedRevision: current.revision,
      operationId: 'native-text-tilt',
      commands: [
        {
          type: 'still.layer.compositing',
          payload: { layerId: 'native-text', patch: { rotation3d: { x: 24, y: -12, perspective: 1200 } } },
        },
      ],
    });
    await evaluate(`document.querySelector('[data-layer-id="native-text"] .layer-select').click()`);
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('.perspective-controls'))`));
    expect((await snapshot()).document.state.composition!.find((r) => r.id === 'native-text')!.rotation3d).toEqual({
      x: 24,
      y: -12,
      perspective: 1200,
    });
    const transforms = await evaluate<string[]>(
      `[...document.querySelectorAll('.webcam-selection')].map(e=>getComputedStyle(e).transform)`,
    );
    expect(transforms.some((value) => value.startsWith('matrix3d'))).toBe(true);
    const output = join(root, 'native-3d.png');
    await call('render.export', { projectId, output });
    expect((await readFile(output)).readUInt32BE(16)).toBe(1280);
  }, 60000);
  it('edits group position, size and rotation together from the left Placement inspector', async () => {
    const before = await snapshot(),
      font = await call<{ id: string; family: string }>('fonts.import', {
        source: resolve(checkout, 'public/font/HankenGrotesk-VariableFont_wght.ttf'),
      });
    const text = createElementText('Beam');
    Object.assign(text.style, {
      fontFamily: font.family,
      fontAssetId: font.id,
      fontSize: 48,
      color: '#0000ff',
      wrap: false,
    });
    text.padding = 0;
    await call('documents.transact', {
      projectId,
      expectedRevision: before.revision,
      operationId: 'group-placement-fixture',
      commands: [
        ...before.document.state.shapes
          .filter((row) => row.enabled)
          .map((row) => ({ type: 'still.layer.enable', payload: { layerId: row.id, enabled: false } })),
        ...['group-inspector-a', 'group-inspector-b'].map((id, index) => ({
          type: 'still.layer.add',
          payload: {
            ...DEFAULT_SHAPE_LAYER_STYLE,
            id,
            name: `Group member ${index + 1}`,
            kind: 'shape',
            assetId: '',
            trackId: 'text',
            timelineStartMs: 0,
            timelineDurationMs: 1,
            sourceInMs: 0,
            sourceDurationMs: 1,
            playbackRate: 1,
            transitions: { entry: null, exit: null },
            enabled: true,
            order: 0,
            family: 'text',
            preset: 'text',
            fillEnabled: false,
            transform: { x: 0.45 + index * 0.18, y: 0.25, width: 0.1, height: 0.1 },
            text,
          },
        })),
        {
          type: 'still.selection.group',
          payload: { layerIds: ['group-inspector-a', 'group-inspector-b'], groupId: 'inspector-pair' },
        },
      ],
    });
    await wait(() =>
      evaluate<boolean>(
        `(()=>{const row=document.querySelector('[data-layer-id="group-inspector-a"] .layer-select');row?.click();return Boolean(document.querySelector('[data-screenshot-group-inspector] input[aria-label="Width"]'))})()`,
      ),
    );
    const rect = await evaluate<{ x: number; y: number; width: number; height: number }>(
      `(()=>{const r=document.querySelector('.screenshot-stage canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
    const from = { x: rect.x + rect.width * 0.4, y: rect.y - 10 },
      to = { x: rect.x + rect.width * 0.74, y: rect.y + rect.height * 0.36 };
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...to, button: 'left', buttons: 1 });
    await wait(() =>
      evaluate<boolean>(`Boolean(document.querySelector('.screenshot-marquee-surface > .canvas-marquee-box'))`),
    );
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', clickCount: 1 });
    await wait(() =>
      evaluate<boolean>(
        `Boolean(document.querySelector('[data-screenshot-group-inspector] input[aria-label="Width"]'))`,
      ),
    );
    expect(await evaluate(`Boolean(document.querySelector('[data-screenshot-group] .resize-handle'))`)).toBe(true);
    const edit = async (label: string, value: number) =>
      evaluate(
        `(()=>{const field=document.querySelector('[data-screenshot-group-inspector] input[aria-label="${label}"]');field.focus();field.dispatchEvent(new FocusEvent('focus'));field.value='${value}';field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new FocusEvent('blur'))})()`,
      );
    await edit('Horizontal', 40);
    await wait(
      async () =>
        Math.abs(
          (await snapshot()).document.state.shapes.find((row) => row.id === 'group-inspector-a')!.transform.x - 0.4,
        ) < 0.000001,
    );
    let state = (await snapshot()).document.state;
    expect(state.shapes.find((row) => row.id === 'group-inspector-b')!.transform.x).toBeCloseTo(0.58);
    await edit('Width', 716.8);
    await wait(
      async () =>
        Math.abs(
          (await snapshot()).document.state.shapes.find((row) => row.id === 'group-inspector-a')!.transform.width - 0.2,
        ) < 0.000001,
    );
    state = (await snapshot()).document.state;
    expect(state.shapes.find((row) => row.id === 'group-inspector-b')!.transform.x).toBeCloseTo(0.76);
    expect(state.shapes.find((row) => row.id === 'group-inspector-a')!.text!.style.fontSize).toBeCloseTo(96);
    await edit('Rotation', 90);
    await wait(
      async () =>
        (await snapshot()).document.state.shapes.find((row) => row.id === 'group-inspector-a')!.rotation === 90,
    );
    state = (await snapshot()).document.state;
    const members = state.shapes.filter((row) => row.id.startsWith('group-inspector-'));
    expect(members.map((row) => row.rotation)).toEqual([90, 90]);
    expect(members[0]!.transform.x).toBeCloseTo(members[1]!.transform.x);
    expect(Math.abs(members[1]!.transform.y - members[0]!.transform.y) * 720).toBeCloseTo(0.36 * 1280);
    const screen = (await cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await writeFile('/tmp/beam-group-placement.png', Buffer.from(screen.data, 'base64'));
  }, 60000);
  it.each([
    { variant: 'center', content: 'Beam Studio', fontSize: 62, verticalAlign: 'center', wrap: false, padding: 0 },
    { variant: 'bottom', content: 'Agjp\nBeam', fontSize: 48, verticalAlign: 'bottom', wrap: true, padding: 10 },
    { variant: 'tilted', content: 'ÉgjBeam', fontSize: 84, verticalAlign: 'top', wrap: false, padding: 6 },
  ] as const)(
    'keeps native text at the same vertical position when inline editing finishes: $variant',
    async ({ variant, content, fontSize, verticalAlign, wrap, padding }) => {
      const id = `baseline-text-${variant}`;
      const font = await call<{ id: string; family: string }>('fonts.import', {
        source: resolve(checkout, 'public/font/HankenGrotesk-VariableFont_wght.ttf'),
      });
      const text = createElementText('Beam');
      Object.assign(text.style, { fontFamily: font.family, fontAssetId: font.id, fontSize, color: '#0000ff', wrap });
      text.padding = padding;
      text.verticalAlign = verticalAlign;
      const before = await snapshot();
      await call('documents.transact', {
        projectId,
        expectedRevision: before.revision,
        operationId: `native-text-baseline-fixture-${variant}`,
        commands: [
          ...before.document.state.shapes
            .filter((row) => row.enabled)
            .map((row) => ({ type: 'still.layer.enable', payload: { layerId: row.id, enabled: false } })),
          {
            type: 'still.layer.add',
            payload: {
              ...DEFAULT_SHAPE_LAYER_STYLE,
              id,
              name: 'Beam baseline',
              kind: 'shape',
              trackId: 'text',
              assetId: '',
              timelineStartMs: 0,
              timelineDurationMs: 1,
              sourceInMs: 0,
              sourceDurationMs: 1,
              playbackRate: 1,
              transitions: { entry: null, exit: null },
              enabled: true,
              order: 0,
              family: 'text',
              preset: 'text',
              fillEnabled: false,
              transform: { x: 0.6, y: 0.3, width: 0.25, height: 0.2 },
              text,
            },
          },
          ...(variant === 'tilted'
            ? [
                {
                  type: 'still.layer.compositing',
                  payload: { layerId: id, patch: { rotation3d: { x: 18, y: -8, perspective: 1200 } } },
                },
              ]
            : []),
        ],
      });
      await evaluate(
        `(()=>{const c=document.querySelector('button.composition-toggle');if(c?.getAttribute('aria-expanded')==='false')c.click()})()`,
      );
      await wait(() => evaluate<boolean>(`Boolean(document.querySelector('[data-layer-id="${id}"]'))`));
      await evaluate(`document.querySelector('[data-layer-id="${id}"] .layer-select').click()`);
      await wait(() =>
        evaluate<boolean>(
          `(()=>{const c=document.querySelector('.screenshot-stage canvas');return [...c.getContext('2d').getImageData(0,0,c.width,c.height).data].some((v,i,a)=>i%4===2&&v>200&&a[i-1]<50&&a[i-2]<50)})()`,
        ),
      );
      await evaluate(
        `(()=>{const p=document.querySelector('.screenshot-toolbar button[aria-controls]');if(p.getAttribute('aria-expanded')==='true')p.click();const c=document.querySelector('button.composition-toggle');if(c?.getAttribute('aria-expanded')==='true')c.click();document.activeElement?.blur()})()`,
      );
      await wait(() => evaluate<boolean>(`!document.querySelector('.composition-content')`));
      await wait(() =>
        evaluate<boolean>(
          `(()=>{if(document.querySelector('.caption-text-editor textarea'))return true;const canvas=document.querySelector('.screenshot-stage canvas'),r=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:r.x+r.width*0.68,clientY:r.y+r.height*0.4}));return Boolean(document.querySelector('.caption-text-editor textarea'))})()`,
        ),
      );
      await evaluate(
        `(async()=>{const field=document.querySelector('.caption-text-editor textarea');field.value=${JSON.stringify(content)};field.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(done=>setTimeout(done,200));await new Promise(requestAnimationFrame)})()`,
      );
      const captureBounds = async (name: string) => {
        const screen = (await cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
        await writeFile(`/tmp/beam-text-${variant}-${name}.png`, Buffer.from(screen.data, 'base64'));
        return evaluate<{ top: number; bottom: number }>(`(async()=>{
        const image=await createImageBitmap(await(await fetch('data:image/png;base64,${screen.data}')).blob());
        const c=new OffscreenCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);
        const a=ctx.getImageData(0,0,c.width,c.height).data;let top=c.height,bottom=-1;
        for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(a[i]<50&&a[i+1]<50&&a[i+2]>200){top=Math.min(top,y);bottom=Math.max(bottom,y)}}
        return {top,bottom};
      })()`);
      };
      const editing = await captureBounds('while-editing');
      await evaluate(`document.querySelector('.caption-text-editor textarea').dispatchEvent(new FocusEvent('blur'))`);
      await wait(() => evaluate<boolean>(`!document.querySelector('.caption-text-editor textarea')`));
      await evaluate(`new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))`);
      const finished = await captureBounds('after-editing');
      expect((await snapshot()).document.state.shapes.find((row) => row.id === id)!.text!.content).toBe(content);
      expect(editing.bottom).toBeGreaterThan(editing.top);
      expect(Math.abs(finished.top - editing.top), JSON.stringify({ editing, finished })).toBeLessThanOrEqual(1);
      expect(Math.abs(finished.bottom - editing.bottom)).toBeLessThanOrEqual(1);
      await evaluate(
        `(()=>{const c=document.querySelector('button.composition-toggle');if(c?.getAttribute('aria-expanded')==='false')c.click();const p=document.querySelector('.screenshot-toolbar button[aria-controls]');if(p.getAttribute('aria-expanded')==='false')p.click()})()`,
      );
    },
    60000,
  );
  it('selects with left and right rectangles, groups with Ctrl+G and moves and resizes common bounds', async () => {
    const current = await snapshot(),
      base = current.document.state.shapes[0]!;
    await call('documents.transact', {
      projectId,
      expectedRevision: current.revision,
      operationId: 'native-group-fixture',
      commands: ['a', 'b'].map((id, i) => ({
        type: 'still.layer.add',
        payload: {
          ...base,
          id: 'group-' + id,
          name: 'Group ' + id,
          text: { ...base.text!, content: id.toUpperCase() },
          transform: { x: 0.5 + i * 0.16, y: 0.2, width: 0.1, height: 0.1 },
        },
      })),
    });
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('[data-layer-id="group-b"]'))`));
    await evaluate(
      `(()=>{const p=document.querySelector('.screenshot-toolbar button[aria-controls]');if(p.getAttribute('aria-expanded')==='true')p.click();const c=document.querySelector('button.composition-toggle');if(c?.getAttribute('aria-expanded')==='true')c.click();document.activeElement?.blur()})()`,
    );
    const canvas = await evaluate<{ x: number; y: number; width: number; height: number }>(
      `(()=>{const r=document.querySelector('.screenshot-stage canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
    const point = (x: number, y: number) => ({ x: canvas.x + x * canvas.width, y: canvas.y + y * canvas.height });
    const mouse = (type: string, p: { x: number; y: number }, button = 'left', buttons = 0) =>
      cdp('Input.dispatchMouseEvent', { type, ...p, button, buttons, clickCount: 1 });
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, button = 'left') => {
      await mouse('mousePressed', from, button, button === 'right' ? 2 : 1);
      await mouse('mouseMoved', to, button, button === 'right' ? 2 : 1);
      await mouse('mouseReleased', to, button);
    };
    await drag(point(0.47, 0.13), point(0.79, 0.34));
    await wait(() => evaluate<boolean>(`document.querySelectorAll('[data-screenshot-group]').length===1`));
    const key = async (shift = false) => {
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'g',
        code: 'KeyG',
        windowsVirtualKeyCode: 71,
        modifiers: shift ? 10 : 2,
      });
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'g',
        code: 'KeyG',
        windowsVirtualKeyCode: 71,
        modifiers: shift ? 10 : 2,
      });
    };
    await key();
    await wait(async () =>
      Boolean((await snapshot()).document.state.composition!.find((r) => r.id === 'group-a')!.groupId),
    );
    const grouped = await snapshot(),
      members = grouped.document.state.composition!.filter((r) => r.id.startsWith('group-'));
    expect(members[0]!.groupId).toBe(members[1]!.groupId);
    await mouse('mousePressed', point(0.45, 0.12));
    await mouse('mouseReleased', point(0.45, 0.12));
    await mouse('mousePressed', point(0.54, 0.25));
    await mouse('mouseReleased', point(0.54, 0.25));
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('[data-screenshot-group]'))`));
    await drag(point(0.59, 0.25), point(0.62, 0.31));
    await wait(
      async () => (await snapshot()).document.state.shapes.find((r) => r.id === 'group-a')!.transform.x > 0.51,
    );
    const moved = (await snapshot()).document.state.shapes.filter((r) => r.id.startsWith('group-'));
    expect(moved[1]!.transform.x - moved[0]!.transform.x).toBeCloseTo(0.16);
    const corner = await evaluate<{ x: number; y: number }>(
      `(()=>{const r=document.querySelector('[data-screenshot-group] .is-bottom-right').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await drag(corner, { x: corner.x + canvas.width * 0.04, y: corner.y + canvas.height * 0.04 });
    await wait(
      async () => (await snapshot()).document.state.shapes.find((r) => r.id === 'group-a')!.transform.width > 0.1,
    );
    const resized = (await snapshot()).document.state.shapes.filter((r) => r.id.startsWith('group-'));
    expect(resized[0]!.text!.style.fontSize).toBeGreaterThan(moved[0]!.text!.style.fontSize);
    await key(true);
    await wait(async () => !(await snapshot()).document.state.composition!.find((r) => r.id === 'group-a')!.groupId);
    await drag(point(0.46, 0.12), point(0.88, 0.44), 'right');
    await wait(() => evaluate<boolean>(`Boolean(document.querySelector('[data-screenshot-group]'))`));
    await mouse('mousePressed', point(0.45, 0.1));
    await mouse('mouseReleased', point(0.45, 0.1));
    const transform = resized[0]!.transform,
      center = point(transform.x + transform.width / 2, transform.y + transform.height / 2);
    await mouse('mousePressed', center);
    await mouse('mouseReleased', center);
    await mouse('mousePressed', center);
    await mouse('mouseMoved', { x: center.x + 20, y: center.y + 16 }, 'left', 1);
    await wait(() => evaluate<boolean>(`document.querySelectorAll('.screenshot-measurement span').length>0`));
    expect(
      await evaluate<string[]>(`[...document.querySelectorAll('.screenshot-measurement span')].map(e=>e.textContent)`),
    ).toEqual(expect.arrayContaining([expect.stringContaining('px')]));
    await mouse('mouseReleased', { x: center.x + 20, y: center.y + 16 });
  }, 60000);
});
