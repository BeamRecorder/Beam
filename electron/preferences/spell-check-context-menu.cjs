const labelsByLocale = {
  bg: { addToDictionary: 'Добавяне в речника', noSuggestions: 'Няма предложения' },
  de: { addToDictionary: 'Zum Wörterbuch hinzufügen', noSuggestions: 'Keine Vorschläge' },
  en: { addToDictionary: 'Add to dictionary', noSuggestions: 'No suggestions' },
  es: { addToDictionary: 'Añadir al diccionario', noSuggestions: 'Sin sugerencias' },
  fr: { addToDictionary: 'Ajouter au dictionnaire', noSuggestions: 'Aucune suggestion' },
  hi: { addToDictionary: 'शब्दकोश में जोड़ें', noSuggestions: 'कोई सुझाव नहीं' },
  it: { addToDictionary: 'Aggiungi al dizionario', noSuggestions: 'Nessun suggerimento' },
  ja: { addToDictionary: '辞書に追加', noSuggestions: '候補はありません' },
  ko: { addToDictionary: '사전에 추가', noSuggestions: '추천 없음' },
  pl: { addToDictionary: 'Dodaj do słownika', noSuggestions: 'Brak sugestii' },
  'pt-BR': { addToDictionary: 'Adicionar ao dicionário', noSuggestions: 'Sem sugestões' },
  ru: { addToDictionary: 'Добавить в словарь', noSuggestions: 'Нет вариантов' },
  vi: { addToDictionary: 'Thêm vào từ điển', noSuggestions: 'Không có đề xuất' },
  'zh-CN': { addToDictionary: '添加到字典', noSuggestions: '无建议' },
  'zh-TW': { addToDictionary: '加入字典', noSuggestions: '沒有建議' },
};

const labelsFor = (locale) => {
  const normalized = String(locale || '').replaceAll('_', '-');
  const exactKey = Object.keys(labelsByLocale).find((key) => key.toLowerCase() === normalized.toLowerCase());
  const base = normalized.split('-')[0].toLowerCase();
  const baseKey = Object.keys(labelsByLocale).find((key) => key.toLowerCase() === base);
  return labelsByLocale[exactKey] ?? labelsByLocale[baseKey] ?? labelsByLocale.en;
};

function createSpellCheckMenuTemplate({ webContents, params, locale }) {
  if (!params?.isEditable) return [];
  const labels = labelsFor(locale);
  const template = [];
  const misspelledWord = typeof params.misspelledWord === 'string' ? params.misspelledWord : '';

  if (misspelledWord) {
    const suggestions = Array.isArray(params.dictionarySuggestions)
      ? [...new Set(params.dictionarySuggestions.filter((value) => typeof value === 'string' && value))].slice(0, 8)
      : [];
    if (suggestions.length) {
      template.push(
        ...suggestions.map((suggestion) => ({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion),
        })),
      );
    } else {
      template.push({ label: labels.noSuggestions, enabled: false });
    }
    template.push(
      { type: 'separator' },
      {
        label: labels.addToDictionary,
        click: () => webContents.session.addWordToSpellCheckerDictionary(misspelledWord),
      },
      { type: 'separator' },
    );
  }

  const flags = params.editFlags ?? {};
  template.push(
    { role: 'undo', enabled: Boolean(flags.canUndo) },
    { role: 'redo', enabled: Boolean(flags.canRedo) },
    { type: 'separator' },
    { role: 'cut', enabled: Boolean(flags.canCut) },
    { role: 'copy', enabled: Boolean(flags.canCopy) },
    { role: 'paste', enabled: Boolean(flags.canPaste) },
    { type: 'separator' },
    { role: 'selectAll', enabled: Boolean(flags.canSelectAll) },
  );
  return template;
}

function registerSpellCheckContextMenu({ app, Menu, BrowserWindow, isTrustedRenderer, getLocale }) {
  const handlers = new Map();
  const attach = (_event, webContents) => {
    const handler = (event, params) => {
      if (webContents.isDestroyed() || !isTrustedRenderer(webContents.getURL())) return;
      if (params.frame?.url && !isTrustedRenderer(params.frame.url)) return;
      const template = createSpellCheckMenuTemplate({ webContents, params, locale: getLocale() });
      if (!template.length) return;
      const window = BrowserWindow.fromWebContents(webContents);
      if (!window) return;
      event.preventDefault();
      const menu = Menu.buildFromTemplate(template);
      menu.popup(params.frame ? { window, frame: params.frame } : { window });
    };
    handlers.set(webContents, handler);
    webContents.on('context-menu', handler);
    webContents.once('destroyed', () => handlers.delete(webContents));
  };

  app.on('web-contents-created', attach);
  return () => {
    app.removeListener('web-contents-created', attach);
    for (const [webContents, handler] of handlers) {
      if (!webContents.isDestroyed()) webContents.removeListener('context-menu', handler);
    }
    handlers.clear();
  };
}

module.exports = { createSpellCheckMenuTemplate, labelsFor, registerSpellCheckContextMenu };
