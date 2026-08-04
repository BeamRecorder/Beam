import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Skeleton from './Skeleton.vue'

describe('Skeleton', () => {
  it('uses stable defaults', () => {
    const wrapper = mount(Skeleton)
    expect(wrapper.classes()).toContain('shimmer-linear')
    expect(wrapper.attributes('style')).toContain('width: 100%')
  })
  it('accepts radial geometry', () => {
    const wrapper = mount(Skeleton, { props: { variant: 'radial', width: '40px', height: '20px', radius: '50%' } })
    expect(wrapper.classes()).toContain('shimmer-radial')
    expect(wrapper.attributes('style')).toContain('border-radius: 50%')
  })
})
