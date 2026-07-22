import { computed, ref } from 'vue'
import {
  BACKGROUND_MEDIA,
  groupBackgroundMedia,
  type BackgroundMedia,
  type BackgroundMediaGroup,
  type BackgroundValue,
} from './backgroundCatalog'

export function useVideoPlayer(availableBackgrounds: readonly BackgroundMedia[] = BACKGROUND_MEDIA) {
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(70)
  const videoSrc = ref<string | null>(null)
  const selectedBackground = ref<BackgroundValue | null>(availableBackgrounds[0] ?? null)
  const backgroundBlurPercent = ref(0)
  const importedBackgrounds = ref<BackgroundMedia[]>([])

  const isVideoEnabled = ref(true)
  const isSystemAudioEnabled = ref(true)
  const isMicAudioEnabled = ref(true)

  const allBackgrounds = computed(() => [...importedBackgrounds.value, ...availableBackgrounds])
  const backgroundGroups = computed<BackgroundMediaGroup[]>(() => groupBackgroundMedia(allBackgrounds.value))
  const selectedBackgroundMedia = computed(() => selectedBackground.value)

  const addBackground = (background: BackgroundMedia) => {
    importedBackgrounds.value = [background, ...importedBackgrounds.value.filter((item) => item.path !== background.path)]
    selectedBackground.value = background
  }

  const restoreBackgrounds = (backgrounds: BackgroundMedia[], selected: BackgroundValue | string | null) => {
    importedBackgrounds.value = backgrounds
    selectedBackground.value = typeof selected === 'string'
      ? [...backgrounds, ...availableBackgrounds].find((background) => background.id === selected || background.path === selected) ?? availableBackgrounds[0] ?? null
      : selected ?? availableBackgrounds[0] ?? null
  }

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
    backgroundBlurPercent,
    selectedBackgroundMedia,
    backgroundGroups,
    importedBackgrounds,
    addBackground,
    restoreBackgrounds,
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
