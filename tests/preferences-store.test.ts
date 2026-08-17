import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { createPreferencesStore, normalize } = require('../electron/preferences/preferences-store.cjs') as {
  createPreferencesStore: (
    directory: string,
    options?: { platform?: string },
  ) => {
    read: () => any;
    patch: (value: unknown) => any;
  };
  normalize: (value: unknown) => any;
};

const directories: string[] = [];
const directory = () => {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-preferences-'));
  directories.push(value);
  return value;
};

afterEach(() => {
  for (const value of directories.splice(0)) fs.rmSync(value, { recursive: true, force: true });
});

describe('preferences background presets', () => {
  it('migrates v1 preferences and supplies empty global presets', () => {
    expect(normalize({ schemaVersion: 1, theme: 'dark' })).toMatchObject({
      schemaVersion: 3,
      theme: 'dark',
      alwaysOnTop: true,
      backgroundPresets: { colors: [], gradients: [] },
      recordingInteractions: { enabled: false, noticeDismissed: false },
    });
  });

  it('supplies the default UI scale when migrating preferences without scale settings', () => {
    expect(
      normalize({ schemaVersion: 1, theme: 'dark', appearance: { primaryColor: '#ABCDEF' } }).appearance.uiScale,
    ).toEqual({
      global: 100,
      overrides: { topbar: null, sidebar: null, properties: null, canvasControls: null, timeline: null },
    });
    expect(normalize({ appearance: { uiScale: undefined } }).appearance.uiScale).toEqual({
      global: 100,
      overrides: { topbar: null, sidebar: null, properties: null, canvasControls: null, timeline: null },
    });
  });

  it('round-trips global UI scale presets and per-region overrides through the preference store', () => {
    const root = directory();
    const store = createPreferencesStore(path.join(root, 'preferences.json'));
    const saved = store.patch({
      appearance: {
        uiScale: {
          global: 75,
          overrides: { topbar: 75, sidebar: 50, properties: null, canvasControls: 100, timeline: null },
        },
      },
    });

    expect(saved.appearance.uiScale).toEqual({
      global: 75,
      overrides: { topbar: 75, sidebar: 50, properties: null, canvasControls: 100, timeline: null },
    });
    expect(store.read().appearance.uiScale).toEqual(saved.appearance.uiScale);
  });

  it('rejects unsupported UI scale values and normalizes every region independently', () => {
    const normalized = normalize({
      appearance: {
        uiScale: {
          global: 83,
          overrides: {
            topbar: 50,
            sidebar: 72,
            properties: 83.5,
            canvasControls: 125,
            timeline: 200,
            ignored: 75,
          },
        },
      },
    });

    expect(normalized.appearance.uiScale).toEqual({
      global: 100,
      overrides: { topbar: 50, sidebar: null, properties: null, canvasControls: 125, timeline: null },
    });
    expect(normalize({ appearance: { uiScale: { global: [], overrides: [] } } }).appearance.uiScale).toEqual({
      global: 100,
      overrides: { topbar: null, sidebar: null, properties: null, canvasControls: null, timeline: null },
    });
  });

  it('normalizes alwaysOnTop preference setting', () => {
    expect(normalize({ alwaysOnTop: false })).toMatchObject({
      alwaysOnTop: false,
    });
    expect(normalize({ alwaysOnTop: true })).toMatchObject({
      alwaysOnTop: true,
    });
  });

  it('normalizes onboardingCompleted preference setting', () => {
    expect(normalize({ onboardingCompleted: false })).toMatchObject({
      onboardingCompleted: false,
    });
    expect(normalize({ onboardingCompleted: true })).toMatchObject({
      onboardingCompleted: true,
    });
  });

  it('normalizes valid presets and deduplicates equivalent values', () => {
    const value = normalize({
      backgroundPresets: {
        colors: ['#ABCDEF', '#abcdef', '#123456'],
        gradients: [
          {
            type: 'linear',
            angle: 450,
            stops: [
              { id: 'a', position: 1, color: '#FFFFFF', alpha: 2 },
              { id: 'b', position: 0, color: '#000000', alpha: -1 },
            ],
          },
          {
            type: 'linear',
            angle: 90,
            stops: [
              { id: 'b', position: 0, color: '#000000', alpha: 0 },
              { id: 'a', position: 1, color: '#ffffff', alpha: 1 },
            ],
          },
        ],
      },
    });
    expect(value.backgroundPresets).toEqual({
      colors: ['#abcdef', '#123456'],
      gradients: [
        {
          type: 'linear',
          angle: 90,
          stops: [
            { id: 'b', position: 0, color: '#000000', alpha: 0 },
            { id: 'a', position: 1, color: '#ffffff', alpha: 1 },
          ],
        },
      ],
    });
  });

  it('rejects malformed presets without discarding valid existing preferences', () => {
    const root = directory();
    const store = createPreferencesStore(path.join(root, 'preferences.json'));
    store.patch({ theme: 'dark', backgroundPresets: { colors: ['#111111'], gradients: [] } });
    const result = store.patch({ backgroundPresets: { colors: ['invalid'], gradients: [{ stops: [] }] } });
    expect(result).toMatchObject({ theme: 'dark', backgroundPresets: { colors: [], gradients: [] } });
  });

  it('returns defaults when the on-disk preference file is corrupt or missing', () => {
    const root = directory();
    const store = createPreferencesStore(path.join(root, 'preferences.json'));
    expect(store.read()).toMatchObject({ schemaVersion: 3, backgroundPresets: { colors: [], gradients: [] } });
    fs.writeFileSync(path.join(root, 'preferences.json'), '{broken');
    expect(store.read()).toMatchObject({ schemaVersion: 3, backgroundPresets: { colors: [], gradients: [] } });
  });
});
