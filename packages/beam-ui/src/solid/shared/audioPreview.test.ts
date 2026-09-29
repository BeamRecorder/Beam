import { afterEach, expect, it, vi } from 'vitest'
import type { ApplicationServices } from '@argui/host'
import { BeamApi } from './beamApi'

afterEach(() => vi.restoreAllMocks())

it('returning to a retained launcher produces newer meter requests than the region scene', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100)
  const call = vi.fn(async (_service: string, _method: string, _payload: { revision: number }) => ({ microphone: null, systemAudio: null }))
  const services = { call } as unknown as ApplicationServices
  const launcher = new BeamApi(services)
  await launcher.audioPreview({ microphoneId: 'mic', systemAudioId: null })
  clock.mockReturnValue(200)
  const region = new BeamApi(services, 'regionActions')
  await region.audioPreview({ microphoneId: 'mic', systemAudioId: 'default' })
  clock.mockReturnValue(300)
  await launcher.audioPreview({ microphoneId: 'mic', systemAudioId: 'default' })
  expect(call.mock.calls[2][2].revision).toBeGreaterThan(call.mock.calls[1][2].revision)
  expect(call.mock.calls[1][2].revision).toBeGreaterThan(call.mock.calls[0][2].revision)
})
