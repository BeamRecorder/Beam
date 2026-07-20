import { ref, computed } from 'vue'

export interface WallpaperOption {
  name: string
  path: string
}

export const WALLPAPERS: WallpaperOption[] = [
  { name: 'Sonoma Light', path: '/wallpapers/sonoma-light.jpg' },
  { name: 'Sonoma Dark', path: '/wallpapers/sonoma-dark.jpg' },
  { name: 'Sonoma Clouds', path: '/wallpapers/sonoma-clouds.jpg' },
  { name: 'Sonoma Evening', path: '/wallpapers/sonoma-evening.jpg' },
  { name: 'Sonoma Horizon', path: '/wallpapers/sonoma-horizon.jpg' },
  { name: 'Ventura Dark', path: '/wallpapers/ventura-dark.jpg' },
  { name: 'Ventura', path: '/wallpapers/ventura.jpg' },
  { name: 'Tahoe Dark', path: '/wallpapers/tahoe-dark.jpg' },
  { name: 'Tahoe Light', path: '/wallpapers/tahoe-light.jpg' },
  { name: 'Sequoia Blue', path: '/wallpapers/sequoia-blue.jpg' },
  { name: 'Sequoia Blue Orange', path: '/wallpapers/sequoia-blue-orange.jpg' },
  { name: 'Blue Rays', path: '/wallpapers/bluerays.jpeg' },
  { name: 'Cherry Pop', path: '/wallpapers/cherrypop.jpg' },
  { name: 'Cityscape', path: '/wallpapers/cityscape.jpg' },
  { name: 'Farm Valley', path: '/wallpapers/farmvalley.jpg' },
  { name: 'Luis Del Rio', path: '/wallpapers/luisdelrio.jpg' },
  { name: 'Mountain Trees', path: '/wallpapers/mountaintrees.jpg' },
  { name: 'Wallpaper 1', path: '/wallpapers/wallpaper1.jpg' },
  { name: 'Wallpaper 2', path: '/wallpapers/wallpaper2.jpg' },
  { name: 'Wallpaper 3', path: '/wallpapers/wallpaper3.jpg' },
  { name: 'Wallpaper 4', path: '/wallpapers/wallpaper4.jpg' },
]

export function useVideoPlayer() {
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(30) // Default mock duration 30s
  const volume = ref(70)
  const videoSrc = ref('/wallpapers/wispysky.mp4') // Default high-fidelity wallpaper video
  const selectedWallpaper = ref('/wallpapers/sonoma-light.jpg') // Default wallpaper
  
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
    videoSrc,
    selectedWallpaper,
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
