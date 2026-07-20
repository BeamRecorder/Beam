import { ref, computed } from 'vue'

export function useVideoPlayer() {
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(30) // Default mock duration 30s
  const volume = ref(70)
  
  // Track states: Video, System Audio, Mic Audio
  const isVideoEnabled = ref(true)
  const isSystemAudioEnabled = ref(true)
  const isMicAudioEnabled = ref(true)

  const togglePlay = () => {
    isPlaying.value = !isPlaying.value
  }

  const seek = (time: number) => {
    currentTime.value = Math.max(0, Math.min(time, duration.value))
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  const formattedCurrentTime = computed(() => formatTime(currentTime.value))
  const formattedDuration = computed(() => formatTime(duration.value))

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    isVideoEnabled,
    isSystemAudioEnabled,
    isMicAudioEnabled,
    togglePlay,
    seek,
    formattedCurrentTime,
    formattedDuration,
    formatTime,
  }
}
