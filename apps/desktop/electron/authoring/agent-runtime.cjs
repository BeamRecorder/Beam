const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes, randomUUID } = require('node:crypto');
const { createAgentServer } = require('./agent-server.cjs');
const { createDocumentBridge } = require('./document-bridge.cjs');
const { createHtmlFiles } = require('./html-files.cjs');
const { createHtmlRenderer } = require('./html-renderer.cjs');
const { openAuthoringProject } = require('./project-opening.cjs');
const { restrictHtmlPreviewNavigation } = require('./html-preview-page.cjs');
const { validateHtmlComposition } = require('../../../../packages/engine/src/html/html-schema.js');

async function initializeAgentRuntime(options) {
  const {
    app,
    ipcMain,
    BrowserWindow,
    session,
    editorWindow,
    projectStore,
    screenshotStore,
    backgroundLibrary,
    fontLibrary,
    cursorLibrary,
    coordinator,
    nativeImage,
    screenshotPresetStore,
  } = options;
  const bridge = createDocumentBridge({ ipcMain, editorWindow });
  const files = createHtmlFiles({ projectStore, screenshotStore });
  const sources = new Map();
  const previewOwners = new WeakSet();
  let server;
  const renderer = createHtmlRenderer({ BrowserWindow, session, files, origin: () => server.origin });
  const sourcesFor = (context, assets) =>
    assets
      .filter((asset) => asset.html)
      .map((asset) => {
        if (typeof asset.id !== 'string' || !asset.id) throw new Error('Invalid HTML asset identity.');
        validateHtmlComposition(asset.html);
        files.fileFor(context, asset.html, asset.html.entry);
        const identity = `${context.projectId}:${asset.id}:${asset.html.id}:${asset.html.revision}`;
        let source = [...sources.values()].find((item) => item.identity === identity);
        if (!source) {
          if (sources.size >= 2048) throw new Error('Too many HTML frame sources. Restart Beam to release them.');
          source = { identity, context, html: asset.html, token: randomBytes(32).toString('hex') };
          sources.set(source.token, source);
        }
        return { assetId: asset.id, url: `${server.origin}/frame/${source.token}` };
      });
  ipcMain.handle('authoring:html-frame', (event, html, timeMs) => {
    validateHtmlComposition(html);
    return renderer.capture(bridge.contextFor(event.sender), html, timeMs);
  });
  ipcMain.handle('authoring:html-sources', (event, assets) => {
    if (!Array.isArray(assets) || assets.length > 2048) throw new Error('Invalid HTML sources.');
    return sourcesFor(bridge.contextFor(event.sender), assets);
  });
  ipcMain.handle('authoring:html-preview-source', (event, html) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('HTML preview requires the editor main frame.');
    validateHtmlComposition(html);
    const context = bridge.contextFor(event.sender);
    const [source] = sourcesFor(context, [{ id: html.id, html }]);
    if (!previewOwners.has(event.sender)) {
      restrictHtmlPreviewNavigation(event.sender, server.origin);
      previewOwners.add(event.sender);
    }
    return `${source.url.replace('/frame/', '/preview/')}/${html.entry}`;
  });
  const resolveUrl = (value) =>
    projectStore.mediaFileForUrl(value) ||
    screenshotStore.fileForUrl(value) ||
    backgroundLibrary.fileForUrl(value) ||
    fontLibrary.fileForUrl(value) ||
    cursorLibrary.fileForUrl(value);
  const portable = (value) => {
    if (typeof value === 'string' && value.startsWith('project-media:')) {
      const file = resolveUrl(value);
      if (!file) throw new Error(`Project asset is missing: ${value}`);
      return pathToFileURL(file).href;
    }
    if (Array.isArray(value)) return value.map(portable);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item)]));
    return value;
  };
  const publish = async (context, input) => {
    const html = files.stage(context, input);
    try {
      const pixels = await renderer.capture(context, html, 0);
      const preview = path.join(files.directoryFor(context, html), 'preview.png');
      fs.writeFileSync(preview, pixels);
      const asset =
        context.kind === 'image'
          ? screenshotStore.importImage(context.projectId, preview)
          : projectStore.importEditorMedia(context.projectId, { kind: 'image', source: preview });
      return { ...asset, html };
    } catch (error) {
      fs.rmSync(files.directoryFor(context, html), { recursive: true, force: true });
      throw error;
    }
  };
  const dispatch = async (tool, input) => {
    if (!coordinator.canAcceptWork()) throw new Error('Beam is shutting down.');
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Tool arguments must be an object.');
    if (tool === 'fonts.list') return fontLibrary.list();
    if (tool === 'fonts.import') {
      if (
        Object.keys(input).some((key) => key !== 'source') ||
        typeof input.source !== 'string' ||
        !path.isAbsolute(input.source)
      )
        throw new Error('Provide an absolute font source path.');
      const font = fontLibrary.importFile(input.source);
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('font-library:changed');
      return font;
    }
    if (tool === 'projects.list')
      return {
        projects: [
          ...projectStore.list().map((p) => ({ ...p, kind: 'video' })),
          ...screenshotStore.list().map((p) => ({ id: p.id, name: p.name, kind: 'image' })),
        ],
        open: bridge.list(),
      };
    if (tool === 'projects.create') {
      if (input.kind === 'video') return { ...projectStore.create({ name: input.name }), kind: 'video' };
      if (input.kind !== 'image') throw new Error('Project kind must be image or video.');
      const width = input.width,
        height = input.height;
      if (![width, height].every((n) => Number.isInteger(n) && n >= 2 && n <= 8192) || width * height > 16777216)
        throw new Error('Provide valid screenshot dimensions (up to 16 megapixels).');
      const created = screenshotStore.create();
      try {
        const pixels = Buffer.alloc(width * height * 4); // An explicitly empty transparent canvas.
        fs.writeFileSync(created.path, nativeImage.createFromBitmap(pixels, { width, height }).toPNG());
        const presets = screenshotPresetStore.read();
        const settings = presets.presets.find((item) => item.id === presets.activePresetId)?.settings;
        if (!settings) throw new Error('Active screenshot preset is unavailable.');
        const preset = {
          ...settings,
          export: { ...settings.export, resolution: 'custom' },
          editor: {
            ...settings.editor,
            presentation: {
              ...settings.editor.presentation,
              canvas: {
                ...settings.editor.presentation.canvas,
                preset: 'custom',
                width,
                height,
                showBackground: false,
              },
            },
          },
        };
        const document = screenshotStore.complete(created.id, { width, height }, preset, input.name);
        return { id: document.id, name: document.name, kind: 'image' };
      } catch (error) {
        screenshotStore.remove(created.id);
        throw error;
      }
    }
    if (tool === 'projects.open') return openAuthoringProject(input, { editorWindow, projectStore, screenshotStore });
    if (tool === 'documents.request') return bridge.request(input.projectId, input.request);
    if (tool === 'assets.resolve') {
      let directory;
      try {
        directory = projectStore.directoryFor(input.projectId);
      } catch {
        screenshotStore.read(input.projectId);
        directory = screenshotStore.directoryFor(input.projectId);
      }
      const file = resolveUrl(input.source);
      const root = fs.realpathSync(directory);
      if (!file || !fs.realpathSync(file).startsWith(root + path.sep))
        throw new Error('The reference source does not belong to this project.');
      return { path: file, source: pathToFileURL(file).href };
    }
    const context = bridge.context(input.projectId);
    if (tool === 'assets.import' && context.kind === 'image' && input.kind !== 'image')
      throw new Error('Screenshot projects accept image imports only.');
    if (tool === 'assets.import')
      return context.kind === 'image'
        ? screenshotStore.importImage(context.projectId, input.source)
        : projectStore.importEditorMedia(context.projectId, { source: input.source, kind: input.kind });
    if (tool === 'html.stage') return publish(context, input);
    if (tool === 'html.source') {
      validateHtmlComposition(input.html);
      return { directory: path.join(files.directoryFor(context, input.html), 'source'), html: input.html };
    }
    if (tool === 'documents.export') {
      const response = await bridge.request(input.projectId, { version: 1, id: randomUUID(), method: 'snapshot' });
      if (!response.ok) throw new Error(response.error.message);
      const document = response.result.document;
      if (context.kind === 'image') return { kind: 'image', document: portable(document) };
      return {
        documentId: context.projectId,
        projectName: context.name,
        format: input.format ?? 'mp4',
        preset: input.preset ?? 'high',
        snapshot: portable(document),
        frameSources: sourcesFor(context, document.composition.assets),
      };
    }
    throw new Error(`Unknown live tool: ${tool}`);
  };
  try {
    server = await createAgentServer({
      dispatch,
      profile: app.getPath('userData'),
      bundleFile: renderer.bundleFile,
      previewFile: (token, relative) => {
        const source = sources.get(token);
        return source
          ? {
              file: files.fileFor(source.context, source.html, relative),
              entry: relative === source.html.entry,
              previewId: `${source.html.id}:${source.html.revision}`,
            }
          : null;
      },
      frame: (token, timeMs, width) => {
        const source = sources.get(token);
        if (!source) throw new Error('Unknown HTML frame source.');
        return renderer.capture(source.context, source.html, timeMs, width);
      },
    });
  } catch (error) {
    bridge.dispose();
    renderer.dispose();
    throw error;
  }
  coordinator.registerCleanup({
    id: 'agent-authoring',
    cleanup: async () => {
      bridge.dispose();
      renderer.dispose();
      sources.clear();
      await server.dispose();
    },
  });
  console.log(`[Beam agent] Listening on ${server.origin} (local CLI).`);
}
module.exports = { initializeAgentRuntime };
