import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, type Ref } from 'vue';
import { editorSearchKey, type EditorSearchAction } from '../../editor/search/editor-search-types';
import type { EditorExportSource } from '@beam/encoder/export-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import ExportDialog from '../ExportDialog.vue';

const api = vi.hoisted(() => ({
  platform: 'win32',
  getEditorPresets: vi.fn(),
  updateEditorPreset: vi.fn(),
  openFile: vi.fn(),
  showItemInFolder: vi.fn(),
}));
const job = vi.hoisted(() => ({ start: vi.fn(), cancel: vi.fn(), state: null as Record<string, Ref<unknown>> | null }));
vi.mock('~/api/capture', () => ({ capture: api }));
vi.mock('../useExportJob', async () => {
  const { ref } = await import('vue');
  job.state = Object.fromEntries(
    [
      'progress',
      'preview',
      'error',
      'errorContext',
      'result',
      'diagnostics',
      'isChoosingDestination',
      'isExporting',
    ].map((key) => [key, ref(null)]),
  );
  return { useExportJob: () => ({ ...job.state, start: job.start, cancel: job.cancel }) };
});

const request: EditorExportSource = {
  projectName: 'Demo',
  duration: 12,
  fps: 30,
  width: 1920,
  height: 1080,
  includeAudio: true,
  hasAudio: true,
  createSnapshot: vi.fn(() => ({ canvas: {}, render: {} }) as CompositionSnapshot),
};
const wrappers: ReturnType<typeof mount>[] = [];
const mountDialog = (registerActions = vi.fn<(provider: () => EditorSearchAction[]) => () => void>(() => vi.fn())) => {
  const wrapper = mount(ExportDialog, {
    props: { request },
    attachTo: document.body,
    global: {
      provide: { [editorSearchKey as symbol]: { registerActions } },
      stubs: { teleport: true, DirectoryPreference: true },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};
const open = async (wrapper: ReturnType<typeof mount>) => {
  await wrapper.get('.export-trigger').trigger('click');
  await flushPromises();
};
beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
  vi.clearAllMocks();
  setActivePinia(createPinia());
  api.getEditorPresets.mockResolvedValue({ presets: [] });
  api.updateEditorPreset.mockResolvedValue({});
  job.start.mockResolvedValue(undefined);
  for (const value of Object.values(job.state!)) value.value = null;
  Object.defineProperty(window, 'capture', { configurable: true, value: api });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
});

it('opens a modal, focuses the name, closes with Escape and restores focus', async () => {
  const wrapper = mountDialog();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  (wrapper.get('.export-trigger').element as HTMLButtonElement).focus();
  await open(wrapper);
  expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(wrapper.get('input[aria-label="File name"]').element);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await nextTick();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(document.activeElement).toBe(wrapper.get('.export-trigger').element);
});
it('uses search to open the dialog and unregisters on disposal', async () => {
  const dispose = vi.fn();
  const register = vi.fn<(provider: () => EditorSearchAction[]) => () => void>(() => dispose);
  const wrapper = mountDialog(register);
  const actions = (register.mock.calls[0]![0] as unknown as () => EditorSearchAction[])();
  actions[0]!.run();
  await nextTick();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  wrapper.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});
it('updates the estimate with settings without building a snapshot', async () => {
  const wrapper = mountDialog();
  await open(wrapper);
  const initial = wrapper.get('.export-estimate strong').text();
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Low')!
    .trigger('click');
  expect(wrapper.get('.export-estimate strong').text()).not.toBe(initial);
  expect(request.createSnapshot).not.toHaveBeenCalled();
});
it('shows audio and playhead switches directly without another button group', async () => {
  const wrapper = mountDialog();
  await open(wrapper);
  expect(wrapper.get('[role="switch"]').attributes('aria-label')).toBe('Include audio');
  expect(wrapper.get('.export-range [role="switch"]').attributes('aria-checked')).toBe('false');
  expect(wrapper.find('.accordion-trigger').exists()).toBe(false);
  expect(wrapper.find('.export-range .btn-group').exists()).toBe(false);
});
it('updates the estimate for the range and can restore the entire video', async () => {
  const wrapper = mountDialog();
  await wrapper.setProps({ playheadSeconds: 3 });
  await open(wrapper);
  const fullSize = wrapper.get('.export-estimate strong').text();
  await wrapper.get('.export-range [role="switch"]').trigger('click');
  expect(wrapper.get('.export-estimate strong').text()).not.toBe(fullSize);
  await wrapper.get('.export-range [role="switch"]').trigger('click');
  expect(wrapper.get('.export-estimate strong').text()).toBe(fullSize);
  await wrapper.get('.export-submit').trigger('click');
  await flushPromises();
  expect(job.start).toHaveBeenCalledWith(
    expect.objectContaining({ snapshot: expect.objectContaining({ duration: 12 }) }),
  );
});
it('rejects an empty filename and passes an edited basename separately from the project name', async () => {
  const wrapper = mountDialog();
  await open(wrapper);
  await wrapper.get('input[aria-label="File name"]').setValue('  ');
  expect(wrapper.get('.export-submit').attributes('disabled')).toBeDefined();
  await wrapper.get('input[aria-label="File name"]').setValue('  Walkthrough  ');
  await wrapper.get('.export-submit').trigger('click');
  await flushPromises();
  expect(job.start).toHaveBeenCalledWith(expect.objectContaining({ projectName: 'Demo', fileName: 'Walkthrough' }));
});
it('follows a renamed project until the filename has been customized', async () => {
  const wrapper = mountDialog();
  await open(wrapper);
  await wrapper.setProps({ request: { ...request, projectName: 'Renamed' } });
  expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Renamed');
  await wrapper.get('input').setValue('Custom');
  await wrapper.setProps({ request: { ...request, projectName: 'Another name' } });
  expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Custom');
});
it('closes the dialog immediately and prevents a second export while saving preferences', async () => {
  let finish!: () => void;
  api.updateEditorPreset.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const wrapper = mountDialog();
  await open(wrapper);
  const submit = wrapper.get('.export-submit');
  await submit.trigger('click');
  await submit.trigger('click');
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(wrapper.find('.export-status-host').exists()).toBe(true);
  expect(document.body.style.overflow).toBe('');
  await open(wrapper);
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(api.updateEditorPreset).toHaveBeenCalledOnce();
  finish();
  await flushPromises();
  expect(job.start).toHaveBeenCalledOnce();
});

it('keeps real progress in the pill, leaves the editor interactive and shows completion actions there', async () => {
  let finish!: () => void;
  job.start.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const wrapper = mountDialog();
  await open(wrapper);
  await wrapper.get('.export-submit').trigger('click');
  await flushPromises();
  job.state!.isExporting!.value = true;
  job.state!.progress!.value = { overallProgress: 0.6, completedImages: 6, totalImages: 10 };
  await nextTick();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(wrapper.get('.progress').attributes('aria-valuenow')).toBe('60');
  expect(wrapper.get('.export-trigger').text()).toBe('60%');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(job.cancel).not.toHaveBeenCalled();
  job.state!.isExporting!.value = false;
  job.state!.result!.value = { path: '/tmp/demo.webm' };
  finish();
  await flushPromises();
  await wrapper.get('.snip-surface').trigger('mouseenter');
  await wrapper
    .findAll('.snip-pill button')
    .find((button) => button.attributes('aria-label') === 'Open folder')!
    .trigger('click');
  expect(api.showItemInFolder).toHaveBeenCalledWith('/tmp/demo.webm');
  expect(wrapper.find('.result-box').exists()).toBe(false);
  await open(wrapper);
  expect(wrapper.find('input[aria-label="File name"]').exists()).toBe(true);
  expect(wrapper.find('.export-status-host').exists()).toBe(true);
});

it('retains a completed export until its pill is dismissed', async () => {
  job.start.mockImplementationOnce(async () => {
    job.state!.result!.value = { path: '/tmp/finished.mp4' };
  });
  const wrapper = mountDialog();
  await open(wrapper);
  await wrapper.get('.export-submit').trigger('click');
  await flushPromises();
  expect(wrapper.get('.snip-pill').text()).toContain('finished.mp4');
  await wrapper.get('[aria-label="Dismiss"]').trigger('click');
  expect(wrapper.find('.export-status-host').exists()).toBe(false);
  await open(wrapper);
  expect(wrapper.find('input[aria-label="File name"]').exists()).toBe(true);
});

it('does not count audio in the estimate when the project has no enabled audio track', async () => {
  const wrapper = mountDialog();
  await open(wrapper);
  await wrapper.setProps({ request: { ...request, hasAudio: false } });
  const silentSize = wrapper.get('.export-estimate strong').text();
  await wrapper.setProps({ request: { ...request, hasAudio: true, includeAudio: false } });
  expect(wrapper.get('.export-estimate strong').text()).toBe(silentSize);
});

it('explains that the nominal estimate can exceed a static video size', async () => {
  const wrapper = mountDialog();
  await open(wrapper);
  expect(wrapper.get('.export-estimate').text()).toContain('Estimated size ≈');
  expect(wrapper.get('.export-estimate small').text()).toBe(
    'Based on target bitrate. Static scenes can be much smaller.',
  );
});

it('allows cancellation before preference saving has finished without starting an export', async () => {
  let finish!: () => void;
  api.updateEditorPreset.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const wrapper = mountDialog();
  await open(wrapper);
  await wrapper.get('.export-submit').trigger('click');
  await wrapper
    .findAll('.snip-details button')
    .find((button) => button.text() === 'Cancel Export')!
    .trigger('click');
  finish();
  await flushPromises();
  expect(job.start).not.toHaveBeenCalled();
  expect(wrapper.find('.export-status-host').exists()).toBe(false);
});

it('keeps snapshot failures in the editable configuration', async () => {
  const wrapper = mountDialog();
  await wrapper.setProps({
    request: {
      ...request,
      createSnapshot: () => {
        throw new Error('Snapshot unavailable');
      },
    },
  });
  await open(wrapper);
  await wrapper.get('.export-submit').trigger('click');
  expect(wrapper.get('[role="alert"]').text()).toContain('Snapshot unavailable');
  expect(wrapper.find('.export-status-host').exists()).toBe(false);
});
