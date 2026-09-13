import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { propertyInteractionActive, resetPropertyInteractions } from '~/composables/property-interaction';
import ScreenshotCropSelection from '../ScreenshotCropSelection.vue';
import CanvasCropSelection from '../../canvas/CanvasCropSelection.vue';
import { screenshotState } from '../screenshot-state';
import { screenshotCropBounds } from '../screenshot-geometry';

const stateFixture = () =>
  screenshotState({
    id: 'test',
    name: 'test',
    source: 'test.png',
    width: 2000,
    height: 1000,
    state: null,
    preset: {
      editor: { schemaVersion: 1 },
      devices: {},
      export: {},
      quickSnip: { automaticZoom: false },
    },
  });

beforeEach(resetPropertyInteractions);
afterEach(resetPropertyInteractions);

describe('screenshot crop controls', () => {
  it('maps pointer movement back to source pixels when the screenshot is mirrored', async () => {
    const state = stateFixture();
    state.image.isMirrored = true;
    state.image.crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 };
    const wrapper = mount(ScreenshotCropSelection, {
      props: { state, sourceSize: { width: 2000, height: 1000 } },
    });
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 200,
    } as DOMRect);
    const shared = wrapper.findComponent(CanvasCropSelection);
    const target = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    };
    const event = {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      currentTarget: target,
      preventDefault: vi.fn(),
    };
    shared.vm.$emit('move-start', event);
    expect(propertyInteractionActive.value).toBe(true);
    shared.vm.$emit('move', { ...event, clientX: 140, clientY: 120 });
    expect(propertyInteractionActive.value).toBe(true);
    const crop = wrapper.emitted('crop')![0]![0] as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    expect(crop.x).toBeCloseTo(0);
    expect(crop.y).toBeCloseTo(0.3);
    expect(crop.width).toBe(0.6);
    expect(crop.height).toBe(0.5);
    shared.vm.$emit('move-end', event);
    expect(propertyInteractionActive.value).toBe(false);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    shared.vm.$emit('move', { ...event, clientX: 160 });
    expect(wrapper.emitted('crop')).toHaveLength(1);
    shared.vm.$emit('done');
    expect(wrapper.emitted('done')).toHaveLength(1);
    wrapper.unmount();
  });

  it('resizes through shared crop handles and ignores non-primary pointers', () => {
    const state = stateFixture();
    const wrapper = mount(ScreenshotCropSelection, {
      props: { state, sourceSize: { width: 2000, height: 1000 } },
    });
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 200,
    } as DOMRect);
    const shared = wrapper.findComponent(CanvasCropSelection);
    const target = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => false,
      releasePointerCapture: vi.fn(),
    };
    const event = {
      button: 2,
      pointerId: 1,
      clientX: 400,
      clientY: 200,
      currentTarget: target,
      preventDefault: vi.fn(),
    };
    shared.vm.$emit('resize-start', 'bottom-right', event);
    shared.vm.$emit('resize-move', { ...event, clientX: 200, clientY: 100 });
    expect(wrapper.emitted('crop')).toBeUndefined();
    shared.vm.$emit('resize-start', 'bottom-right', { ...event, button: 0 });
    expect(propertyInteractionActive.value).toBe(true);
    shared.vm.$emit('resize-move', { ...event, clientX: 200, clientY: 100 });
    expect(wrapper.emitted('crop')).toEqual([[{ x: 0, y: 0, width: 0.5, height: 0.5 }]]);
    shared.vm.$emit('resize-end', event);
    expect(propertyInteractionActive.value).toBe(false);
    expect(target.releasePointerCapture).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('releases the active crop transaction after pointer cancellation and unmount', async () => {
    const state = stateFixture();
    const wrapper = mount(ScreenshotCropSelection, {
      props: { state, sourceSize: { width: 2000, height: 1000 } },
    });
    const overlay = wrapper.get('.crop-overlay-box');
    const target = overlay.element as HTMLElement;
    const releasePointerCapture = vi.fn<(pointerId: number) => void>();
    Object.defineProperty(target, 'setPointerCapture', {
      value: vi.fn<(pointerId: number) => void>(),
    });
    Object.defineProperty(target, 'hasPointerCapture', {
      value: vi.fn<(pointerId: number) => boolean>(() => true),
    });
    Object.defineProperty(target, 'releasePointerCapture', {
      value: releasePointerCapture,
    });

    await overlay.trigger('pointerdown', {
      button: 0,
      pointerId: 8,
      clientX: 100,
      clientY: 100,
    });
    expect(propertyInteractionActive.value).toBe(true);
    await overlay.trigger('pointercancel', {
      pointerId: 8,
      clientX: 100,
      clientY: 100,
    });
    expect(propertyInteractionActive.value).toBe(false);
    expect(releasePointerCapture).toHaveBeenCalledWith(8);
    wrapper.unmount();

    const pending = mount(ScreenshotCropSelection, {
      props: {
        state: stateFixture(),
        sourceSize: { width: 2000, height: 1000 },
      },
    });
    pending.findComponent(CanvasCropSelection).vm.$emit('resize-start', 'bottom-right', {
      button: 0,
      pointerId: 9,
      clientX: 100,
      clientY: 100,
      currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: vi.fn(),
    });
    expect(propertyInteractionActive.value).toBe(true);
    pending.unmount();
    expect(propertyInteractionActive.value).toBe(false);
  });

  it('places crop controls inside browser chrome and phone letterboxing', () => {
    const state = stateFixture();
    const full = screenshotCropBounds(state, 2000, 1000);
    state.image.appearance.frame = 'safari';
    const safari = screenshotCropBounds(state, 2000, 1000);
    expect(safari.y).toBeGreaterThan(full.y);
    expect(safari.height).toBeLessThan(full.height);
    state.image.appearance.frame = 'iphone-16-max';
    const phone = screenshotCropBounds(state, 2000, 1000);
    expect(phone.width / phone.height).toBeCloseTo(2);
  });
});
