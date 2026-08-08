import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorWindowApp from '../EditorWindowApp.vue';

const state = vi.hoisted(() => ({
  contextListener: null as ((context: { projectId: string }) => void) | null,
  removeContextListener: vi.fn(),
}));

const capture = vi.hoisted(() => ({
  getEditorContext: vi.fn(),
  getProjectEditorData: vi.fn(),
  listProjects: vi.fn(),
  notifyEditorReady: vi.fn(),
  reportEditorLoadingStage: vi.fn(),
  onEditorContext: vi.fn((listener: (context: { projectId: string }) => void) => {
    state.contextListener = listener;
    return state.removeContextListener;
  }),
  setCameraOverlayActive: vi.fn(),
  setEditorTitlebarTheme: vi.fn(),
  showHud: vi.fn(),
  startRecordingFromEditor: vi.fn(),
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../ui/toast/ToastProvider.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../ui/button/Button.vue', () => ({ default: { template: '<button><slot /></button>' } }));
vi.mock('../VideoEditor.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockVideoEditor',
      emits: ['ready', 'back-to-hud', 'open-project', 'start-recording'],
      setup(_, { emit }) {
        return () =>
          h('div', { class: 'mock-editor' }, [
            h('button', { class: 'ready', onClick: () => emit('ready') }),
            h('button', { class: 'back', onClick: () => emit('back-to-hud') }),
            h('button', {
              class: 'record',
              onClick: () => emit('start-recording', { screenKind: 'display', recordingBarVisibility: 'always' }),
            }),
          ]);
      },
    }),
  };
});

const project = { id: 'project-1', name: 'Project', previewSrc: 'project.mp4' };

describe('EditorWindowApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.contextListener = null;
    capture.getEditorContext.mockResolvedValue({ projectId: project.id });
    capture.listProjects.mockResolvedValue([project]);
    capture.getProjectEditorData.mockResolvedValue({ composition: {}, zoom: {}, presentation: {} });
  });

  it('loads the editor context and notifies the native window when ready', async () => {
    const wrapper = mount(EditorWindowApp);
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    expect(wrapper.find('.mock-editor').exists()).toBe(true);
    expect(capture.getProjectEditorData).toHaveBeenCalledWith(project.id);
    expect(capture.reportEditorLoadingStage.mock.calls.map(([stage]) => stage)).toEqual([
      'loadingProject',
      'loadingTimeline',
      'renderingEditor',
    ]);
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
  });

  it('returns to the HUD and forwards recording requests', async () => {
    const wrapper = mount(EditorWindowApp);
    await flushPromises();

    await wrapper.get('.back').trigger('click');
    expect(capture.setCameraOverlayActive).toHaveBeenCalledWith(true);
    expect(capture.showHud).toHaveBeenCalledOnce();

    await wrapper.get('.record').trigger('click');
    expect(capture.startRecordingFromEditor).toHaveBeenCalledWith({
      screenKind: 'display',
      recordingBarVisibility: 'always',
    });
  });

  it('shows a recoverable error when the requested project is unavailable', async () => {
    capture.listProjects.mockResolvedValue([]);
    const wrapper = mount(EditorWindowApp);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Project not found');
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(capture.showHud).toHaveBeenCalledOnce();
  });
});
