import { ref } from 'vue'

export type CursorType = 'pointer' | 'link' | 'text' | 'grabbing' | 'busy'

export function useCursorReplacer() {
  const selectedCursor = ref<CursorType>('pointer')
  const cursorSize = ref(24)
  const cursorColor = ref('#000000')
  const enableShadow = ref(true)
  const enableRipple = ref(true)
  
  // Custom cursor SVG paths for rendering on canvas
  const cursorSvgs: Record<CursorType, string> = {
    pointer: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path d="M4.5 3v15.2l3.8-3.8 2.9 6.8 2.4-1-2.9-6.8h5.3z" fill="black" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
    link: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path d="M9 3v2h2v4H9v2h2v8H9v2h6v-2h-2v-8h2V9h-2V5h2V3z" fill="none"/>
      <path d="M12 2a3 3 0 0 0-3 3v2.5a.5.5 0 0 0 1 0V5a2 2 0 1 1 4 0v11.5a1.5 1.5 0 1 1-3 0V9a1 1 0 1 0-2 0v7.5a3.5 3.5 0 1 0 7 0V5a3 3 0 0 0-3-3z" fill="black" stroke="white" stroke-width="1"/>
      <path d="M7 11.5V13a.5.5 0 0 0 1 0v-1.5a.5.5 0 0 0-1 0zm-2 2V15a.5.5 0 0 0 1 0v-1.5a.5.5 0 0 0-1 0z" fill="black" stroke="white" stroke-width="1"/>
    </svg>`,
    text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path d="M9 4h6M12 4v16M9 20h6" stroke="black" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M9 4h6M12 4v16M9 20h6" stroke="white" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
    grabbing: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path d="M8 9a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v-1a1.5 1.5 0 0 1 3 0v4a5 5 0 0 1-10 0zm3-3a1.5 1.5 0 0 1 3 0v4a1.5 1.5 0 0 1-3 0z" fill="black" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
    busy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="spin">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#ddd" stroke-width="2"/>
      <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="black" stroke-width="2"/>
    </svg>`
  }

  // Pre-load SVG as Image helper
  const getCursorImage = (type: CursorType, size: number, color: string): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const img = new Image()
      let svgContent = cursorSvgs[type]
      
      // Inject size
      svgContent = svgContent.replace('width="24"', `width="${size}"`).replace('height="24"', `height="${size}"`)
      
      // If color is customized and not default black
      if (color !== '#000000') {
        svgContent = svgContent.replace('fill="black"', `fill="${color}"`).replace('stroke="black"', `stroke="${color}"`)
      }

      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.src = url
    })
  }

  return {
    selectedCursor,
    cursorSize,
    cursorColor,
    enableShadow,
    enableRipple,
    getCursorImage,
  }
}
