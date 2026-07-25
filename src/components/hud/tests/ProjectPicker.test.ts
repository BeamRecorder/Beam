import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureMock as capture } from './capture.mock'

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }))
import ProjectPicker from '../ProjectPicker.vue'

const projects = [{ id: 'one', name: 'First', createdAt: '', updatedAt: '2025-01-01T00:00:00.000Z', sessionCount: 1, previewSrc: null }, { id: 'two', name: 'Second', createdAt: '', updatedAt: 'invalid', sessionCount: 2, previewSrc: null }]
const stubs = { Dialog: { template: '<div><slot /><slot name="footer" :close="() => {}" /></div>' }, Popover: { template: '<div><slot name="trigger" :isOpen="false" /><slot :close="() => {}" /></div>' } }
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
  it('renames a project, rejects unchanged names, and handles rename failure', async () => {
    capture.listProjects.mockResolvedValue(projects); capture.renameProject.mockResolvedValue(projects[0]); const wrapper = mount(ProjectPicker, { global: { stubs } }); await settle()
    const rename = wrapper.findAll('button').find((button) => button.text() === 'Rename'); await rename?.trigger('click'); const input = () => wrapper.findAll('.input-element')[0]; await input().setValue(' Renamed '); await input().trigger('keydown', { key: 'Enter' }); await settle(); expect(capture.renameProject).toHaveBeenCalledWith('one', 'Renamed')
    await rename?.trigger('click'); await input().trigger('keydown', { key: 'Enter' }); expect(capture.renameProject).toHaveBeenCalledTimes(1)
    capture.renameProject.mockRejectedValueOnce(new Error('rename blocked')); await rename?.trigger('click'); await input().setValue('Blocked'); await input().trigger('keydown', { key: 'Enter' }); await settle(); expect(wrapper.findAll('.input-element')).toHaveLength(1)
  })
  it('deletes a selected project and selects the next remaining project', async () => {
    capture.listProjects.mockResolvedValueOnce(projects).mockResolvedValueOnce([projects[1]]); capture.deleteProject.mockResolvedValue(undefined); const wrapper = mount(ProjectPicker, { props: { compact: true, currentProjectId: 'one' }, global: { stubs } }); await settle()
    const remove = wrapper.findAll('button').find((button) => button.text() === 'Delete'); await remove?.trigger('click'); await wrapper.vm.$nextTick(); const deletes = wrapper.findAll('button').filter((button) => button.text() === 'Delete'); await deletes[deletes.length - 1]?.trigger('click'); await settle(); expect(capture.deleteProject).toHaveBeenCalledWith('one'); expect(wrapper.text()).toContain('Second')
  })
  it('keeps video preview progress and resets it after mouse leave', async () => {
    const preview = { ...projects[0], previewSrc: 'file:///preview.mp4' }; capture.listProjects.mockResolvedValue([preview]); const wrapper = mount(ProjectPicker, { global: { stubs } }); await settle();
    await wrapper.get('.project-card-media').trigger('mouseenter'); await wrapper.vm.$nextTick();
    const video = wrapper.get('video').element as HTMLVideoElement; Object.defineProperty(video, 'duration', { value: 2 }); Object.defineProperty(video, 'currentTime', { value: 1, writable: true }); video.play = vi.fn().mockResolvedValue(undefined); video.pause = vi.fn(); await wrapper.get('video').trigger('loadedmetadata'); await wrapper.get('video').trigger('timeupdate'); expect(wrapper.find('.preview-progress-overlay').exists()).toBe(true); await wrapper.get('.project-card-media').trigger('mouseleave'); expect(video.pause).toHaveBeenCalledOnce(); expect(video.currentTime).toBe(.1)
  })
})
