/// <reference types="vite/client" />

declare module 'virtual:public-background-media' {
  export const images: string[]
  export const videos: string[]
  const wallpapers: { images: string[]; videos: string[] }
  export default wallpapers
}
