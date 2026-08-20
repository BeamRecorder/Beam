import { describe, expect, it, vi } from 'vitest';

const { registerProjectIpc, CURSOR_PACK_DISCOVERY_URL } = require('../electron/projects/project-ipc.cjs') as {
  CURSOR_PACK_DISCOVERY_URL: string;
  registerProjectIpc: (
    ipcMain: { handle: (channel: string, handler: Function) => void },
    projectStore: object,
    backgroundLibrary: object,
    fontLibrary: object,
    dialog: object,
    BrowserWindow: object,
    trustedRenderer: (url: string) => boolean,
    cursorLibrary?: object,
  ) => void;
};

const importedFont = {
  id: 'a'.repeat(64),
  family: 'Imported Sans',
  fullName: 'Imported Sans Regular',
  extension: '.ttf',
  url: 'project-media://font/' + 'a'.repeat(64),
};

const setup = (options: { trusted?: boolean; rendererUrl?: string } = {}) => {
  const handlers = new Map<string, Function>();
  const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler) };
  const importFile = vi.fn((source) => ({ source }));
  const fontImportFile = vi.fn(() => importedFont);
  const fontList = vi.fn(() => [importedFont]);
  const dialog = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['C:/wallpaper.png'] }) };
  const window = { webContents: { send: vi.fn() } };
  const windows = { getAllWindows: () => [window] };
  const event = { sender: { getURL: vi.fn(() => options.rendererUrl ?? 'file:///editor.html') } };
  const trustedRenderer = vi.fn(() => options.trusted ?? true);
  const projectStore = {
    importDroppedProjectMedia: vi.fn((projectId, input) => ({ projectId, ...input })),
  };
  const backgroundLibrary = { importFile, list: vi.fn() };
  const fontLibrary = { importFile: fontImportFile, list: fontList };
  const cursorLibrary = {
    importDirectory: vi.fn(() => ({
      pack: { id: 'pack' },
      importedCount: 1,
      ignoredAnimatedRoles: [],
      duplicate: false,
    })),
    list: vi.fn(() => []),
  };
  registerProjectIpc(
    ipcMain,
    projectStore,
    backgroundLibrary,
    fontLibrary,
    dialog,
    windows,
    trustedRenderer,
    cursorLibrary,
  );
  return {
    handler: handlers.get('background-library:pick-import')!,
    droppedHandler: handlers.get('projects:import-dropped-media')!,
    fontListHandler: handlers.get('font-library:list')!,
    fontImportHandler: handlers.get('font-library:pick-import')!,
    cursorImportHandler: handlers.get('cursor-packs:pick-import')!,
    dialog,
    importFile,
    fontImportFile,
    fontList,
    cursorLibrary,
    projectStore,
    window,
    event,
    trustedRenderer,
  };
};

describe('background import IPC', () => {
  it('limits image imports to supported image extensions', async () => {
    const { handler, dialog } = setup();
    await handler({}, { projectId: 'project', kind: 'image' });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp'] }],
      }),
    );
  });

  it('limits video imports to supported video extensions', async () => {
    const { handler, dialog } = setup();
    await handler({}, { projectId: 'project', kind: 'video' });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: 'Vidéos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'] }] }),
    );
  });

  it('uses the combined filter for a custom background or invalid kind', async () => {
    const { handler, dialog } = setup();
    await handler({}, { projectId: 'project', kind: 'invalid' });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({ name: 'Fonds personnalisés', extensions: expect.arrayContaining(['png', 'mp4']) }),
        ],
      }),
    );
  });

  it('does not import when the file picker is cancelled', async () => {
    const { handler, dialog, importFile } = setup();
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(handler({}, { projectId: 'project', kind: 'media' })).resolves.toBeNull();
    expect(importFile).not.toHaveBeenCalled();
  });

  it('notifies every renderer after a global import', async () => {
    const { handler, window } = setup();
    await handler({}, { kind: 'image' });
    expect(window.webContents.send).toHaveBeenCalledWith('background-library:changed');
  });

  it('delegates dropped media to the project store without rewriting the source', async () => {
    const { droppedHandler, projectStore } = setup();
    const source = '/tmp/drop/../recording.mp4';
    expect(droppedHandler({}, { projectId: 'project-42', source, kind: 'video' })).toEqual({
      projectId: 'project-42',
      source,
      kind: 'video',
    });
    expect(projectStore.importDroppedProjectMedia).toHaveBeenCalledOnce();
    expect(projectStore.importDroppedProjectMedia).toHaveBeenCalledWith('project-42', { source, kind: 'video' });
  });

  it('lists imported fonts for a trusted renderer', async () => {
    const { fontListHandler, fontList, event, trustedRenderer } = setup({ rendererUrl: 'file:///editor.html' });

    expect(fontListHandler(event)).toEqual([importedFont]);
    expect(fontList).toHaveBeenCalledOnce();
    expect(trustedRenderer).toHaveBeenCalledWith('file:///editor.html');
  });

  it('imports a font for a trusted renderer and notifies every renderer', async () => {
    const { fontImportHandler, fontImportFile, dialog, event, window, trustedRenderer } = setup({
      rendererUrl: 'http://localhost:6500/editor.html',
    });
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/fonts/ImportedSans.ttf'] });

    await expect(fontImportHandler(event)).resolves.toEqual(importedFont);
    expect(trustedRenderer).toHaveBeenCalledWith('http://localhost:6500/editor.html');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openFile'],
      filters: [{ name: 'Polices', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    });
    expect(fontImportFile).toHaveBeenCalledWith('C:/fonts/ImportedSans.ttf');
    expect(window.webContents.send).toHaveBeenCalledWith('font-library:changed');
  });

  it.each(['font-library:list', 'font-library:pick-import'])(
    'rejects %s for an untrusted renderer',
    async (channel) => {
      const { fontListHandler, fontImportHandler, fontList, fontImportFile, dialog, event, trustedRenderer } = setup({
        trusted: false,
        rendererUrl: 'https://example.invalid/evil.html',
      });
      const handler = channel === 'font-library:list' ? fontListHandler : fontImportHandler;

      if (channel === 'font-library:list') expect(() => handler(event)).toThrow('Renderer non autorisé');
      else await expect(handler(event)).rejects.toThrow('Renderer non autorisé');
      expect(trustedRenderer).toHaveBeenCalledWith('https://example.invalid/evil.html');
      expect(fontList).not.toHaveBeenCalled();
      expect(fontImportFile).not.toHaveBeenCalled();
      expect(dialog.showOpenDialog).not.toHaveBeenCalled();
    },
  );
});

describe('cursor pack IPC', () => {
  it('uses the KDE cursor-pack discovery URL', () => {
    expect(CURSOR_PACK_DISCOVERY_URL).toBe('https://store.kde.org/browse/cat/107/');
  });

  it('picks only a directory, imports it globally and notifies renderers', async () => {
    const { cursorImportHandler, cursorLibrary, dialog, event, window } = setup();
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/theme'] });
    await expect(cursorImportHandler(event)).resolves.toMatchObject({ importedCount: 1 });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({ properties: ['openDirectory'] });
    expect(cursorLibrary.importDirectory).toHaveBeenCalledWith('C:/theme');
    expect(window.webContents.send).toHaveBeenCalledWith('cursor-packs:changed');
  });

  it('keeps cancellation side-effect free', async () => {
    const { cursorImportHandler, cursorLibrary, dialog, event } = setup();
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(cursorImportHandler(event)).resolves.toBeNull();
    expect(cursorLibrary.importDirectory).not.toHaveBeenCalled();
  });
});
