export type EditorState = {
  schemaVersion: number;
  composition: {
    schemaVersion: number;
    assets: Array<Record<string, unknown>>;
    clips: unknown[];
    keyboardCaptionSessions: string[];
  };
  zoom: Record<string, unknown>;
  presentation: Record<string, unknown>;
};

export type ProjectStore = {
  create: (options: { name: string }) => { id: string };
  list: () => Array<{ id: string; name: string }>;
  rename: (id: string, name: string) => { name: string };
  editorState: (id: string) => EditorState;
  saveEditorState: (id: string, state: unknown) => unknown;
  importEditorMedia: (
    id: string,
    input: { source: string; kind: 'video' | 'image' | 'audio' },
  ) => { id: string; fileName: string; [key: string]: unknown };
};

export const { createUserPaths } = require('../electron/storage/user-paths.cjs') as {
  createUserPaths: (videos: string) => Record<string, string>;
};

export const { createBackgroundLibrary } = require('../electron/backgrounds/background-library.cjs') as {
  createBackgroundLibrary: (paths: Record<string, string>) => {
    list: () => Array<{ kind: string; path: string; fileName: string }>;
    importFile: (source: string) => { kind: string; path: string; fileName: string };
  };
};

export const { createProjectStore } = require('../electron/projects/project-store.cjs') as {
  createProjectStore: (root: string) => ProjectStore;
};
