import { computed, ref } from 'vue'
import {
  BACKGROUND_MEDIA,
  groupBackgroundMedia,
  type BackgroundMedia,
  type BackgroundMediaGroup,
} from './backgroundMedia'

export function useVideoPlayer(availableBackgrounds: readonly BackgroundMedia[] = BACKGROUND_MEDIA) {
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(70)
  const videoSrc = ref<string | null>(null)
  const selectedBackground = ref<string | null>(availableBackgrounds[0]?.path ?? null)

  const isVideoEnabled = ref(true)
  const isSystemAudioEnabled = ref(true)
  const isMicAudioEnabled = ref(true)

  const backgroundGroups = computed<BackgroundMediaGroup[]>(() => groupBackgroundMedia(availableBackgrounds))
  const selectedBackgroundMedia = computed(() =>
    availableBackgrounds.find((background) => background.path === selectedBackground.value) ?? null,
  )

  const togglePlay = () => {
    isPlaying.value = !isPlaying.value
  }

  const seek = (time: number) => {
    if (!Number.isFinite(time)) {
      throw new RangeError('Playback time must be finite.')
    }
    currentTime.value = Math.max(0, Math.min(time, duration.value))
  }

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Playback time must be a non-negative finite number.')
    }
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    videoSrc,
    selectedBackground,
    selectedBackgroundMedia,
    backgroundGroups,
    isVideoEnabled,
    isSystemAudioEnabled,
    isMicAudioEnabled,
    togglePlay,
    seek,
    formattedCurrentTime: computed(() => formatTime(currentTime.value)),
    formattedDuration: computed(() => formatTime(duration.value)),
    formatTime,
  }
}
