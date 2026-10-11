import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { stateFixture } from '../export/tests/export-test-support';
import ScreenshotExportDialog from '../ScreenshotExportDialog.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
vi.mock('~/api/capture', () => ({ capture: {} }));
beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
});
const wrappers: ReturnType<typeof mount>[] = [];
const setup = async (realSizeControls = false) => {
  const save = vi.fn().mockResolvedValue({ status: 'saved', path: '/exports/image.png', bytes: 123456, timings: {} });
  const wrapper = mount(ScreenshotExportDialog, {
    props: {
      state: stateFixture(),
      original: { width: 1200, height: 800 },
      projectName: 'Screenshot',
      busy: false,
      error: '',
      advanced: false,
      keepAspect: true,
      save,
    },
    global: { stubs: { teleport: true, DirectoryPreference: true, ScreenshotSizeControls: !realSizeControls } },
  });
  wrappers.push(wrapper);
  await wrapper.get('.export-trigger').trigger('click');
  return { wrapper, save };
};
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});
const action = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((button) => button.text() === text || button.attributes('aria-label') === text)!;

it('follows project renames while the default export name is unchanged', async () => {
  const { wrapper, save } = await setup();
  for (const projectName of ['Renamed screenshot', 'Final image — Démo']) {
    await wrapper.setProps({ projectName });
    expect((wrapper.get('input[aria-label="File name"]').element as HTMLInputElement).value).toBe(projectName);
  }
  await action(wrapper, 'Save image').trigger('click');
  await flushPromises();
  expect(save).toHaveBeenCalledWith('Final image — Démo', expect.any(Object));
});

it('keeps an explicitly customized export name when the screenshot is renamed', async () => {
  const { wrapper, save } = await setup();
  await wrapper.get('input[aria-label="File name"]').setValue('My output');
  await wrapper.setProps({ projectName: 'Renamed screenshot' });
  expect((wrapper.get('input[aria-label="File name"]').element as HTMLInputElement).value).toBe('My output');
  await action(wrapper, 'Save image').trigger('click');
  await flushPromises();
  expect(save).toHaveBeenCalledWith('My output', expect.any(Object));
});

it('uses a rename made while the export dialog is closed', async () => {
  const { wrapper } = await setup();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await flushPromises();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  await wrapper.setProps({ projectName: 'Renamed while editing' });
  await wrapper.get('.export-trigger').trigger('click');
  expect((wrapper.get('input[aria-label="File name"]').element as HTMLInputElement).value).toBe(
    'Renamed while editing',
  );
});

it('morphs a named export into its status pill with actual size and file actions', async () => {
  const openFile = vi.fn(),
    showItemInFolder = vi.fn();
  Object.defineProperty(window, 'capture', { configurable: true, value: { openFile, showItemInFolder } });
  const { wrapper, save } = await setup();
  await wrapper.get('input[aria-label="File name"]').setValue('  Image final  ');
  await action(wrapper, 'Save image').trigger('click');
  await flushPromises();
  expect(save).toHaveBeenCalledWith(
    'Image final',
    expect.objectContaining({
      signal: expect.any(AbortSignal),
      onPreview: expect.any(Function),
      onReport: expect.any(Function),
    }),
  );
  expect(wrapper.get('.status-copy').text()).toContain('123.5 kB');
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  await action(wrapper, 'View image').trigger('click');
  await flushPromises();
  await action(wrapper, 'Open folder').trigger('click');
  expect(openFile).toHaveBeenCalledWith('/exports/image.png');
  expect(showItemInFolder).toHaveBeenCalledWith('/exports/image.png');
  expect(wrapper.find('.export-footer').exists()).toBe(false);
  await wrapper.get('.export-trigger').trigger('click');
  expect((wrapper.get('input[aria-label="File name"]').element as HTMLInputElement).value).toBe('  Image final  ');
});

it('dismisses cancelled exports and makes the configuration available again', async () => {
  const { wrapper, save } = await setup();
  save.mockResolvedValueOnce({ status: 'cancelled', path: null });
  await action(wrapper, 'Save image').trigger('click');
  await flushPromises();
  expect(wrapper.find('.export-status-host').exists()).toBe(false);
  await wrapper.get('.export-trigger').trigger('click');
  expect(wrapper.find('input[aria-label="File name"]').exists()).toBe(true);
  save.mockRejectedValueOnce(new Error('Disk full'));
  await action(wrapper, 'Save image').trigger('click');
  await flushPromises();
  expect(wrapper.get('.status-error').text()).toBe('Disk full');
});

it('blocks empty names and never starts a busy export', async () => {
  const { wrapper, save } = await setup();
  await wrapper.get('input[aria-label="File name"]').setValue(' ');
  expect(action(wrapper, 'Save image').attributes('disabled')).toBeDefined();
  await wrapper.setProps({ busy: true });
  await action(wrapper, 'Save image').trigger('click');
  expect(save).not.toHaveBeenCalled();
  expect(wrapper.find('.export-status-host').exists()).toBe(false);
});

it('supports WebP quality and opening through the exposed search action', async () => {
  const { wrapper } = await setup();
  await wrapper.setProps({ state: { ...stateFixture(), format: 'webp' } });
  expect(wrapper.find('input[type="range"]').exists()).toBe(true);
  await action(wrapper, '').trigger('click');
  (wrapper.vm as unknown as { open(): void }).open();
  await flushPromises();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
});
it('switches PNG and WebP through the shared animated group and preserves WebP quality', async () => {
  const { wrapper } = await setup();
  const group = wrapper.getComponent(ButtonGroup);
  expect(group.props('variant')).toBe('neutral');
  expect(group.props('selection')).toEqual({ index: 0, count: 2 });
  expect(group.attributes('aria-label')).toBe('Image format');
  expect(group.findAll('[aria-pressed="true"]')).toHaveLength(1);
  await action(wrapper, 'WebP').trigger('click');
  expect(wrapper.props('state').format).toBe('webp');
  expect(group.props('selection')).toEqual({ index: 1, count: 2 });
  expect(action(wrapper, 'WebP').attributes('aria-pressed')).toBe('true');
  await wrapper.get('input[type="range"]').setValue('0.72');
  expect(wrapper.props('state').quality).toBe(0.72);
  await action(wrapper, 'PNG').trigger('click');
  expect(wrapper.find('input[type="range"]').exists()).toBe(false);
  expect(wrapper.props('state').quality).toBe(0.72);
  expect(action(wrapper, 'PNG').attributes('aria-pressed')).toBe('true');
});
it('reflects the document format when a preset changes it externally', async () => {
  const { wrapper } = await setup();
  await wrapper.setProps({ state: { ...stateFixture(), format: 'webp' } });
  expect(wrapper.getComponent(ButtonGroup).props('selection')).toEqual({ index: 1, count: 2 });
  expect(action(wrapper, 'PNG').attributes('aria-pressed')).toBe('false');
  expect(action(wrapper, 'WebP').attributes('aria-pressed')).toBe('true');
});
it('uses the same export-folder control as video and blocks changes during publication', async () => {
  const { wrapper, save } = await setup();
  const directory = wrapper.get('directory-preference-stub');
  expect(directory.attributes()).toMatchObject({ kind: 'exports', compact: 'true', disabled: 'false' });
  await wrapper.setProps({ busy: true });
  expect(directory.attributes('disabled')).toBe('true');
  expect(wrapper.get('fieldset.export-fields').attributes('disabled')).toBeDefined();
  await action(wrapper, 'WebP').trigger('click');
  expect(wrapper.props('state').format).toBe('png');
  expect(save).not.toHaveBeenCalled();
});
it('preserves custom dimensions and aspect ratio controls in the new settings row', async () => {
  const { wrapper } = await setup(true);
  await action(wrapper, 'Advanced').trigger('click');
  expect(wrapper.emitted('update:advanced')).toEqual([[true]]);
  await wrapper.setProps({ advanced: true });
  await flushPromises();
  await wrapper.get('input[aria-label="Width"]').setValue('900');
  expect(wrapper.props('state').canvas.width).toBe(900);
  await wrapper.get('[role="checkbox"]').trigger('click');
  expect(wrapper.emitted('update:keepAspect')).toEqual([[false]]);
});

it('retains the output in the pill until dismissal and keeps the dialog closed', async () => {
  const { wrapper, save } = await setup();
  let finish!: (value: unknown) => void;
  save.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await action(wrapper, 'Save image').trigger('click');
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(wrapper.get('.progress').attributes('aria-valuenow')).toBeUndefined();
  await wrapper.get('.export-trigger').trigger('click');
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  finish({ status: 'saved', path: '/exports/finished.png', bytes: 100, timings: {} });
  await flushPromises();
  expect(wrapper.get('.status-copy').text()).toContain('finished.png');
  await wrapper.get('[aria-label="Dismiss"]').trigger('click');
  expect(wrapper.find('.export-status-host').exists()).toBe(false);
});

it('streams the real preview/report and cancels the actual encode signal', async () => {
  const { wrapper, save } = await setup();
  let finish!: () => void;
  save.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await action(wrapper, 'Save image').trigger('click');
  const options = save.mock.calls[0]![1];
  options.onPreview('data:image/png;base64,real-preview');
  options.onReport({ status: 'running', bytes: 0 });
  await flushPromises();
  expect(wrapper.get('.thumbnail img').attributes('src')).toContain('real-preview');
  await action(wrapper, 'Cancel Export').trigger('click');
  expect(options.signal.aborted).toBe(true);
  finish();
  await flushPromises();
  expect(wrapper.find('.export-status-host').exists()).toBe(false);
});
it('shows host export errors when the worker reports failure without throwing', async () => {
  const { wrapper, save } = await setup();
  save.mockImplementationOnce(async () => {
    await wrapper.setProps({ error: 'Encoding failed' });
  });
  await action(wrapper, 'Save image').trigger('click');
  await flushPromises();
  expect(wrapper.get('.status-error').text()).toBe('Encoding failed');
});
it('cleans up the active encode when the editor unmounts', async () => {
  const { wrapper, save } = await setup();
  save.mockReturnValueOnce(new Promise(() => {}));
  await action(wrapper, 'Save image').trigger('click');
  const options = save.mock.calls[0]![1];
  wrapper.unmount();
  expect(options.signal.aborted).toBe(true);
});
