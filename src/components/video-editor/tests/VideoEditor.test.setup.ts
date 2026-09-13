import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, vi } from 'vitest';
import type { Component } from 'vue';
import './VideoEditor.test.mocks';
import { capture, editorState, exportState, fullscreenState, historyState, toast } from './VideoEditor.test.mocks';

export { capture, editorState, exportState, fullscreenState, historyState, toast };

export const project = {
  id: 'project-1',
  name: 'Project',
  createdAt: '',
  updatedAt: '',
  sessionCount: 1,
  previewSrc: null,
};

let wrapper: VueWrapper | undefined;
let editorComponent: Component | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  fullscreenState.active = false;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  editorState.store = undefined;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

export const setEditorComponent = (component: Component) => {
  editorComponent = component;
};

export const mountEditor = (props: Record<string, unknown> = {}) => {
  if (!editorComponent) throw new Error('VideoEditor test component was not registered.');
  wrapper = mount(editorComponent, { props: { project, editorData: null, ...props } });
  return wrapper;
};
