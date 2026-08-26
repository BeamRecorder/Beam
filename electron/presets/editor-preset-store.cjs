const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const SCHEMA_VERSION = 1;
const DEFAULT_PRESET_ID = 'default';
const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultSettings(preferences = {}) {
  const extras = preferences?.extras && typeof preferences.extras === 'object' ? preferences.extras : {};
  return {
    editor: clone(
      extras.editorDefaults && typeof extras.editorDefaults === 'object' ? extras.editorDefaults : { schemaVersion: 1 },
    ),
    devices: clone(preferences?.devices && typeof preferences.devices === 'object' ? preferences.devices : {}),
    export: clone(
      extras.exportSettings && typeof extras.exportSettings === 'object' ? extras.exportSettings : { format: 'mp4' },
    ),
    quickSnip: { automaticZoom: true },
  };
}

function normalizeSettings(value, fallback) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    editor: clone(
      raw.editor && typeof raw.editor === 'object' && !Array.isArray(raw.editor) ? raw.editor : fallback.editor,
    ),
    devices: clone(
      raw.devices && typeof raw.devices === 'object' && !Array.isArray(raw.devices) ? raw.devices : fallback.devices,
    ),
    export: clone(
      raw.export && typeof raw.export === 'object' && !Array.isArray(raw.export) ? raw.export : fallback.export,
    ),
    quickSnip: {
      automaticZoom:
        typeof raw.quickSnip?.automaticZoom === 'boolean'
          ? raw.quickSnip.automaticZoom
          : fallback.quickSnip.automaticZoom,
    },
  };
}

function initialDocument(preferences = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    activePresetId: DEFAULT_PRESET_ID,
    presets: [
      {
        id: DEFAULT_PRESET_ID,
        name: 'Default',
        protected: true,
        updatedAt: new Date(0).toISOString(),
        settings: defaultSettings(preferences),
      },
    ],
  };
}

function normalizeDocument(value, preferences = {}) {
  const initial = initialDocument(preferences);
  const fallback = initial.presets[0].settings;
  const rawPresets = Array.isArray(value?.presets) ? value.presets : [];
  const seen = new Set();
  const presets = rawPresets.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 100) : '';
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : '';
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        name,
        protected: id === DEFAULT_PRESET_ID,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
        settings: normalizeSettings(raw.settings, fallback),
      },
    ];
  });
  const defaultIndex = presets.findIndex((preset) => preset.id === DEFAULT_PRESET_ID);
  if (defaultIndex < 0) presets.unshift(initial.presets[0]);
  else presets[defaultIndex] = { ...presets[defaultIndex], name: 'Default', protected: true };
  const requestedActive = typeof value?.activePresetId === 'string' ? value.activePresetId : DEFAULT_PRESET_ID;
  return {
    schemaVersion: SCHEMA_VERSION,
    activePresetId: presets.some((preset) => preset.id === requestedActive) ? requestedActive : DEFAULT_PRESET_ID,
    presets,
  };
}

function createEditorPresetStore(file, { readPreferences = () => ({}) } = {}) {
  const target = path.extname(file) ? file : path.join(file, 'editor-presets.json');
  const backup = `${target}.bak`;
  const parse = (candidate) => normalizeDocument(JSON.parse(fs.readFileSync(candidate, 'utf8')), readPreferences());
  const read = () => {
    try {
      return parse(target);
    } catch {
      try {
        return parse(backup);
      } catch {
        const initial = initialDocument(readPreferences());
        return fs.existsSync(target) || fs.existsSync(backup) ? initial : write(initial);
      }
    }
  };
  const write = (value) => {
    const next = normalizeDocument(value, readPreferences());
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    if (fs.existsSync(target)) fs.copyFileSync(target, backup);
    fs.renameSync(temporary, target);
    return next;
  };
  const mutate = (operation) => write(operation(read()));
  const create = (name) =>
    mutate((document) => {
      const normalizedName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
      if (!normalizedName) throw new Error('Preset name cannot be empty.');
      if (document.presets.some((preset) => preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()))
        throw new Error('A preset with this name already exists.');
      const source = document.presets.find((preset) => preset.id === DEFAULT_PRESET_ID);
      const id = randomUUID();
      document.presets.push({
        id,
        name: normalizedName,
        protected: false,
        updatedAt: new Date().toISOString(),
        settings: clone(source.settings),
      });
      document.activePresetId = id;
      return document;
    });
  const rename = (id, name) =>
    mutate((document) => {
      if (id === DEFAULT_PRESET_ID) throw new Error('Default preset cannot be renamed.');
      const preset = document.presets.find((candidate) => candidate.id === id);
      const normalizedName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
      if (!preset) throw new Error('Preset not found.');
      if (!normalizedName) throw new Error('Preset name cannot be empty.');
      if (
        document.presets.some(
          (candidate) =>
            candidate.id !== id && candidate.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
        )
      )
        throw new Error('A preset with this name already exists.');
      preset.name = normalizedName;
      preset.updatedAt = new Date().toISOString();
      return document;
    });
  const remove = (id) =>
    mutate((document) => {
      if (id === DEFAULT_PRESET_ID) throw new Error('Default preset cannot be deleted.');
      if (!document.presets.some((preset) => preset.id === id)) throw new Error('Preset not found.');
      document.presets = document.presets.filter((preset) => preset.id !== id);
      if (document.activePresetId === id) document.activePresetId = DEFAULT_PRESET_ID;
      return document;
    });
  const select = (id) =>
    mutate((document) => {
      if (!document.presets.some((preset) => preset.id === id)) throw new Error('Preset not found.');
      document.activePresetId = id;
      return document;
    });
  const update = (id, settings) =>
    mutate((document) => {
      const preset = document.presets.find((candidate) => candidate.id === id);
      if (!preset) throw new Error('Preset not found.');
      preset.settings = normalizeSettings(settings, preset.settings);
      preset.updatedAt = new Date().toISOString();
      return document;
    });
  const updateActive = (settings) => {
    const document = read();
    return update(document.activePresetId, settings);
  };
  return { read, write, create, rename, remove, select, update, updateActive, file: target };
}

module.exports = {
  DEFAULT_PRESET_ID,
  SCHEMA_VERSION,
  createEditorPresetStore,
  defaultSettings,
  initialDocument,
  normalizeDocument,
};
