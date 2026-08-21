export type EditorState = {
  schemaVersion: number;
  isFresh: boolean;
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

export type UserPaths = {
  user: string;
  preferences: string;
  projects: string;
  wallpapers: string;
  wallpaperImages: string;
  wallpaperVideos: string;
  fonts: string;
  cursors: string;
  whisperModels: string;
};

export const { createUserPaths } = require('../electron/storage/user-paths.cjs') as {
  createUserPaths: (videos: string) => UserPaths;
};

export const { createBackgroundLibrary } = require('../electron/backgrounds/background-library.cjs') as {
  createBackgroundLibrary: (paths: UserPaths) => {
    list: () => Array<{ kind: string; path: string; fileName: string }>;
    importFile: (source: string) => { kind: string; path: string; fileName: string };
    fileForUrl: (url: string) => string | null;
  };
};

export const { createProjectStore } = require('../electron/projects/project-store.cjs') as {
  createProjectStore: (root: string) => ProjectStore;
};
