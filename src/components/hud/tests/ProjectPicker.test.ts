import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureMock as capture } from './capture.mock'

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }))
import ProjectPicker from '../ProjectPicker.vue'

const projects = [{ id: 'one', name: 'First', createdAt: '', updatedAt: '2025-01-01T00:00:00.000Z', sessionCount: 1, previewSrc: null }, { id: 'two', name: 'Second', createdAt: '', updatedAt: 'invalid', sessionCount: 2, previewSrc: null }]
const stubs = { Dialog: { template: '<div><slot /><slot name="footer" :close="() => {}" /></div>' }, Popover: { template: '<div><slot name="trigger" :isOpen="false" /></div>' } }
const settle = async () => { await flushPromises(); await vi.advanceTimersByTimeAsync(180); await flushPromises() }

describe('ProjectPicker', () => {
  beforeEach(() => { vi.useFakeTimers(); capture.listProjects.mockReset(); capture.createProject.mockReset(); capture.renameProject.mockReset(); capture.deleteProject.mockReset() })
  afterEach(() => vi.useRealTimers())
  it('loads projects, uses current selection and opens it', async () => {
    capture.listProjects.mockResolvedValue(projects); const wrapper = mount(ProjectPicker, { props: { currentProjectId: 'two' }, global: { stubs } }); await settle()
    expect(wrapper.text()).toContain('First'); expect(wrapper.text()).toContain('Date inconnue'); const open = wrapper.findAll('button').find((button) => button.text().includes('Open project')); await open?.trigger('click'); expect(wrapper.emitted('open-project')).toEqual([[projects[1]]])
  })
  it('shows a recoverable loading error and retries', async () => {
    capture.listProjects.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]); const wrapper = mount(ProjectPicker, { global: { stubs } }); await settle(); expect(wrapper.get('[role=alert]').text()).toContain('offline'); await wrapper.get('[role=alert] button').trigger('click'); await settle(); expect(wrapper.text()).toContain('No projects yet.')
  })
  it('emits compact selection and creates a new project', async () => {
    capture.listProjects.mockResolvedValue(projects); capture.createProject.mockResolvedValue(projects[0]); const wrapper = mount(ProjectPicker, { props: { compact: true }, global: { stubs } }); await settle(); await wrapper.get('.project-card').trigger('click'); expect(wrapper.emitted('select-project')).toEqual([[projects[0]]]); await wrapper.get('[aria-label="New project"]').trigger('click'); const input = wrapper.find('input'); await input.setValue('  New  '); const create = wrapper.findAll('button').find((button) => button.text() === 'Create'); await create?.trigger('click'); await settle(); expect(capture.createProject).toHaveBeenCalledWith({ name: 'New' }); expect(wrapper.emitted('open-project')).toEqual([[projects[0]]])
  })
})
