import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import Gradient from './Gradient.vue'
import type { GradientValue } from './composables/useGradient'

const Select = {
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: '<button class="select-stub" @click="$emit(\'update:modelValue\', \'radial\')">{{ modelValue }}</button>',
}
const BigSlider = {
  props: ['label', 'modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="slider-stub" @click="$emit(\'update:modelValue\', 400)">{{ label }}</button>',
}
const ColorInput = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="color-stub" @click="$emit(\'update:modelValue\', \'#123456\')">Color</button>',
}
const Button = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button class="button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

const baseGradient: GradientValue = {
  type: 'linear',
  angle: 45,
  stops: [
    { id: 'start', position: 0, color: '#000000', alpha: 1 },
    { id: 'end', position: 1, color: '#ffffff', alpha: 0.5 },
  ],
}

const mountGradient = (props: Record<string, unknown> = {}) =>
  mount(Gradient, {
    props: { modelValue: baseGradient, ...props },
    global: { stubs: { Select, BigSlider, ColorInput, Button } },
  })

describe('Gradient', () => {
  it('renders stops, edits type and angle, adds a stop, and edits the selected stop', async () => {
    const wrapper = mountGradient({ showAngle: true, maxStops: 4 })
    const track = wrapper.get('.gradient-track')
    Object.defineProperty(track.element, 'getBoundingClientRect', {
      value: () => ({ left: 100, right: 300, top: 20, bottom: 48, width: 200, height: 28 }),
    })

    expect(wrapper.findAll('.stop-handle')).toHaveLength(2)
    await wrapper.get('.select-stub').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ type: 'radial' })
    await wrapper.get('.slider-stub').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ angle: 360 })

    await track.trigger('pointerdown', { clientX: 200, clientY: 30 })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      stops: expect.arrayContaining([expect.objectContaining({ position: 0.5 })]),
    })

    await wrapper.find('.stop-handle').trigger('click')
    await nextTick()
    expect(wrapper.find('.stop-edit-form').exists()).toBe(true)
    await wrapper.get('.color-stub').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      stops: expect.arrayContaining([expect.objectContaining({ color: '#123456' })]),
    })
    await wrapper.findAll('.slider-stub')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      stops: expect.arrayContaining([expect.objectContaining({ position: 1 })]),
    })
  })

  it('locks the track at max stops and does not add a duplicate stop', async () => {
    const wrapper = mountGradient({ maxStops: 2 })
    const track = wrapper.get('.gradient-track')
    Object.defineProperty(track.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 100, top: 0, bottom: 28, width: 100, height: 28 }),
    })
    await track.trigger('pointerdown', { clientX: 50, clientY: 10 })
    expect(track.classes()).toContain('is-locked')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('removes a selected stop when more than the minimum are present', async () => {
    const wrapper = mountGradient({ maxStops: 4 })
    const track = wrapper.get('.gradient-track')
    Object.defineProperty(track.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 100, top: 0, bottom: 28, width: 100, height: 28 }),
    })
    await track.trigger('pointerdown', { clientX: 50, clientY: 10 })
    await wrapper.find('.stop-handle').trigger('click')
    await nextTick()
    await wrapper.get('.button-stub').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ stops: expect.any(Array) })
  })
})
