import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { DEFAULT_GRADIENT_RECIPE } from '@beam/engine';
import ScreenshotGradientPreview from './ScreenshotGradientPreview.vue';
const gpu = vi.hoisted(() => ({ create: vi.fn(), render: vi.fn(), dispose: vi.fn() }));
vi.mock('@beam/runtime/gradient/gradient-renderer', () => ({
  GradientRenderer: class {
    constructor() {
      gpu.create();
    }
    render(...args: unknown[]) {
      return gpu.render(...args);
    }
    dispose() {
      gpu.dispose();
    }
  },
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe('procedural gradient live preview', () => {
  it('renders the real recipe and reuses one GPU renderer while controls change', async () => {
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    const wrapper = mount(ScreenshotGradientPreview, { props: { recipe: DEFAULT_GRADIENT_RECIPE } });
    await nextTick();
    expect(gpu.render).toHaveBeenCalledWith(
      DEFAULT_GRADIENT_RECIPE,
      320,
      180,
      { x: [1, 0, 0], y: [0, 1, 0] },
      { width: 320, height: 180 },
      1,
    );
    await wrapper.setProps({ recipe: { ...DEFAULT_GRADIENT_RECIPE, seed: 44 } });
    expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(gpu.create).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
  it('reports a missing drawing surface without allocating a GPU context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const wrapper = mount(ScreenshotGradientPreview, { props: { recipe: DEFAULT_GRADIENT_RECIPE } });
    await nextTick();
    expect(wrapper.get('[role="alert"]').text()).toBeTruthy();
    expect(wrapper.get('canvas').attributes('hidden')).toBeDefined();
    expect(gpu.create).not.toHaveBeenCalled();
    wrapper.unmount();
    expect(gpu.dispose).not.toHaveBeenCalled();
  });
  it('reports GPU failure and recovers when a corrected recipe can render', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    gpu.render.mockImplementationOnce(() => {
      throw new Error('Context lost');
    });
    const wrapper = mount(ScreenshotGradientPreview, { props: { recipe: DEFAULT_GRADIENT_RECIPE } });
    await nextTick();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.setProps({ recipe: { ...DEFAULT_GRADIENT_RECIPE, seed: 45 } });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('canvas').attributes('hidden')).toBeUndefined();
    wrapper.unmount();
  });
});

it('recovers from renderer allocation failure without disposing an unallocated context',async()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);gpu.create.mockImplementationOnce(()=>{throw new Error('GPU unavailable')});
 const wrapper=mount(ScreenshotGradientPreview,{props:{recipe:DEFAULT_GRADIENT_RECIPE}});await nextTick();expect(wrapper.find('[role="alert"]').exists()).toBe(true);expect(gpu.dispose).not.toHaveBeenCalled();await wrapper.setProps({recipe:{...DEFAULT_GRADIENT_RECIPE,seed:22}});expect(wrapper.find('[role="alert"]').exists()).toBe(false);wrapper.unmount();expect(gpu.dispose).toHaveBeenCalledOnce();
});
