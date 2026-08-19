const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  createSpellCheckMenuTemplate,
  registerSpellCheckContextMenu,
} = require('../../electron/preferences/spell-check-context-menu.cjs');

const createWebContents = ({ url = 'beam://app', destroyed = false } = {}) => {
  const webContents = new EventEmitter();
  const calls = [];
  let isDestroyed = destroyed;

  Object.assign(webContents, {
    calls,
    getURL: () => url,
    isDestroyed: () => isDestroyed,
    replaceMisspelling: (suggestion) => calls.push(['replaceMisspelling', suggestion]),
    session: {
      addWordToSpellCheckerDictionary: (word) => calls.push(['addWordToDictionary', word]),
    },
    destroy: () => {
      isDestroyed = true;
      webContents.emit('destroyed');
    },
  });

  return webContents;
};

const findItem = (template, predicate) => {
  const item = template.find(predicate);
  assert.ok(item, 'expected menu item was not found');
  return item;
};

test('returns no menu for non-editable content', () => {
  const webContents = createWebContents();

  assert.deepEqual(
    createSpellCheckMenuTemplate({
      webContents,
      params: { isEditable: false, misspelledWord: 'teh' },
      locale: 'en',
    }),
    [],
  );
});

test('deduplicates and limits suggestions, and replaces the misspelled word', () => {
  const webContents = createWebContents();
  const suggestions = ['the', 'the', 'ten', '', null, 'then', 'them', 'their', 'they', 'there', 'theme', 'thé'];
  const template = createSpellCheckMenuTemplate({
    webContents,
    params: { isEditable: true, misspelledWord: 'teh', dictionarySuggestions: suggestions },
    locale: 'en',
  });

  const suggestionItems = template.filter((item) => typeof item.click === 'function').slice(0, 8);
  assert.deepEqual(
    suggestionItems.map((item) => item.label),
    ['the', 'ten', 'then', 'them', 'their', 'they', 'there', 'theme'],
  );

  suggestionItems[0].click();
  assert.deepEqual(webContents.calls, [['replaceMisspelling', 'the']]);
});

test('shows a localized empty state and add-to-dictionary action', () => {
  const webContents = createWebContents();
  const template = createSpellCheckMenuTemplate({
    webContents,
    params: { isEditable: true, misspelledWord: 'xinloi', dictionarySuggestions: [] },
    locale: 'fr-FR',
  });

  assert.equal(findItem(template, (item) => item.enabled === false).label, 'Aucune suggestion');
  const addItem = findItem(template, (item) => item.label === 'Ajouter au dictionnaire');

  addItem.click();
  assert.deepEqual(webContents.calls, [['addWordToDictionary', 'xinloi']]);
});

test('localizes the empty state and dictionary action for Vietnamese', () => {
  const webContents = createWebContents();
  const template = createSpellCheckMenuTemplate({
    webContents,
    params: { isEditable: true, misspelledWord: 'xinloi', dictionarySuggestions: [] },
    locale: 'vi',
  });

  assert.equal(findItem(template, (item) => item.enabled === false).label, 'Không có đề xuất');
  assert.ok(findItem(template, (item) => item.label === 'Thêm vào từ điển'));
});

test('maps edit flags to native editing roles', () => {
  const webContents = createWebContents();
  const template = createSpellCheckMenuTemplate({
    webContents,
    params: {
      isEditable: true,
      editFlags: {
        canUndo: true,
        canRedo: false,
        canCut: true,
        canCopy: false,
        canPaste: true,
        canSelectAll: false,
      },
    },
    locale: 'en',
  });

  assert.deepEqual(
    template.filter((item) => item.role).map(({ role, enabled }) => ({ role, enabled })),
    [
      { role: 'undo', enabled: true },
      { role: 'redo', enabled: false },
      { role: 'cut', enabled: true },
      { role: 'copy', enabled: false },
      { role: 'paste', enabled: true },
      { role: 'selectAll', enabled: false },
    ],
  );
});

test('ignores context menus from untrusted renderer URLs', () => {
  const app = new EventEmitter();
  const webContents = createWebContents({ url: 'https://attacker.example' });
  let buildCount = 0;
  const Menu = {
    buildFromTemplate: () => {
      buildCount += 1;
    },
  };
  const BrowserWindow = { fromWebContents: () => null };
  const cleanup = registerSpellCheckContextMenu({
    app,
    Menu,
    BrowserWindow,
    isTrustedRenderer: (url) => url === 'beam://app',
    getLocale: () => 'en',
  });
  const event = {
    preventDefault: () => {
      throw new Error('untrusted menu was not filtered');
    },
  };

  app.emit('web-contents-created', {}, webContents);
  webContents.emit('context-menu', event, { isEditable: true });

  assert.equal(buildCount, 0);
  cleanup();
});

test('builds and pops up the menu for a trusted renderer URL', () => {
  const app = new EventEmitter();
  const webContents = createWebContents({ url: 'beam://app/editor' });
  const popupCalls = [];
  const builtTemplates = [];
  const window = { id: 'editor-window' };
  const Menu = {
    buildFromTemplate: (template) => {
      builtTemplates.push(template);
      return { popup: (options) => popupCalls.push(options) };
    },
  };
  const BrowserWindow = { fromWebContents: (contents) => (contents === webContents ? window : null) };
  const cleanup = registerSpellCheckContextMenu({
    app,
    Menu,
    BrowserWindow,
    isTrustedRenderer: (url) => url.startsWith('beam://app'),
    getLocale: () => 'en',
  });
  let prevented = false;
  const frame = { url: 'beam://app/editor' };

  app.emit('web-contents-created', {}, webContents);
  webContents.emit(
    'context-menu',
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    { isEditable: true, frame },
  );

  assert.equal(prevented, true);
  assert.equal(builtTemplates.length, 1);
  assert.equal(popupCalls.length, 1);
  assert.deepEqual(popupCalls[0], { window, frame });
  cleanup();
});

test('ignores an untrusted frame and a trusted webContents without an owning window', () => {
  const app = new EventEmitter();
  const webContents = createWebContents({ url: 'beam://app/editor' });
  let buildCount = 0;
  const Menu = {
    buildFromTemplate: () => {
      buildCount += 1;
    },
  };
  const cleanup = registerSpellCheckContextMenu({
    app,
    Menu,
    BrowserWindow: { fromWebContents: () => null },
    isTrustedRenderer: (url) => url.startsWith('beam://app'),
    getLocale: () => 'en',
  });
  const event = { preventDefault: () => assert.fail('menu should not open') };

  app.emit('web-contents-created', {}, webContents);
  webContents.emit('context-menu', event, { isEditable: true, frame: { url: 'https://attacker.example' } });
  webContents.emit('context-menu', event, { isEditable: true, frame: { url: 'beam://app/editor' } });

  assert.equal(buildCount, 0);
  cleanup();
});

test('cleanup removes app and context-menu listeners', () => {
  const app = new EventEmitter();
  const webContents = createWebContents();
  let buildCount = 0;
  const Menu = {
    buildFromTemplate: () => {
      buildCount += 1;
    },
  };
  const cleanup = registerSpellCheckContextMenu({
    app,
    Menu,
    BrowserWindow: { fromWebContents: () => null },
    isTrustedRenderer: () => true,
    getLocale: () => 'en',
  });

  app.emit('web-contents-created', {}, webContents);
  assert.equal(app.listenerCount('web-contents-created'), 1);
  assert.equal(webContents.listenerCount('context-menu'), 1);

  cleanup();

  assert.equal(app.listenerCount('web-contents-created'), 0);
  assert.equal(webContents.listenerCount('context-menu'), 0);
  webContents.emit('context-menu', { preventDefault: () => {} }, { isEditable: true });
  assert.equal(buildCount, 0);
});
