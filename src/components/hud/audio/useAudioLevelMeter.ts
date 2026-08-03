import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { capture } from '../../../api/capture'

const POLL_INTERVAL_MS = 50

export function useAudioLevelMeter(
  isEnabled: Ref<boolean>,
  sourceId?: Ref<string | undefined>,
  isSystemAudio = false,
) {
  const level = ref(0)
  let monitorId: string | null = null
  let pollTimer: number | null = null
  let lifecycle = 0

  const clearPollTimer = () => {
    if (pollTimer !== null) window.clearTimeout(pollTimer)
    pollTimer = null
  }

  const stop = async () => {
    lifecycle += 1
    clearPollTimer()
    const activeMonitor = monitorId
    monitorId = null
    level.value = 0
    if (activeMonitor) {
      await capture.stopAudioLevelMonitor(activeMonitor).catch(() => undefined)
    }
  }

  const resolveSourceId = async () => {
    const selected = sourceId?.value
    if (selected && selected !== 'no-audio') return selected
    if (!isSystemAudio) return null
    const catalog = await capture.discover()
    const systemSources = catalog.sources.filter((source) => source.kind === 'system-audio')
    return systemSources.find((source) => source.isDefault)?.id ?? systemSources[0]?.id ?? null
  }

  const poll = async (token: number) => {
    if (token !== lifecycle || !monitorId || !isEnabled.value) return
    try {
      const sample = await capture.readAudioLevelMonitor(monitorId)
      if (token !== lifecycle || !monitorId) return
      const next = Math.min(1, Math.max(0, Number.isFinite(sample.level) ? sample.level : 0))
      level.value = level.value * 0.35 + next * 0.65
      pollTimer = window.setTimeout(() => void poll(token), POLL_INTERVAL_MS)
    } catch {
      if (token === lifecycle) await stop()
    }
  }

  const start = async () => {
    await stop()
    if (!isEnabled.value) return
    const token = lifecycle
    try {
      const selectedSource = await resolveSourceId()
      if (token !== lifecycle || !isEnabled.value || !selectedSource) return
      const started = await capture.startAudioLevelMonitor(selectedSource)
      if (token !== lifecycle || !isEnabled.value) {
        await capture.stopAudioLevelMonitor(started.monitorId).catch(() => undefined)
        return
      }
      monitorId = started.monitorId
      await poll(token)
    } catch {
      if (token === lifecycle) await stop()
    }
  }

  watch(
    [isEnabled, () => sourceId?.value],
    () => {
      if (isEnabled.value) void start()
      else void stop()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    void stop()
  })

  return { level }
}
