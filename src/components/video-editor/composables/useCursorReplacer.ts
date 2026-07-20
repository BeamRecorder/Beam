import { ref } from 'vue'

export type CursorType = 'pointer' | 'link' | 'text' | 'grabbing' | 'busy'

export function useCursorReplacer() {
  const selectedCursor = ref<CursorType>('pointer')
  const cursorSize = ref(24)
  const cursorColor = ref('#000000')
  const enableShadow = ref(true)
  const enableRipple = ref(true)
  
  const cursorUrls: Record<CursorType, string> = {
    pointer: '/macOsSvgCursors/default.svg',
    link: '/macOsSvgCursors/handpointing.svg',
    text: '/macOsSvgCursors/textcursor.svg',
    grabbing: '/macOsSvgCursors/handgrabbing.svg',
    busy: '/macOsSvgCursors/busy.svg',
  }

  // Pre-load SVG as Image helper
  const getCursorImage = async (type: CursorType, size: number, color: string): Promise<HTMLImageElement> => {
    const urlPath = cursorUrls[type]
    let svgContent = ''
    try {
      const response = await fetch(urlPath)
      svgContent = await response.text()
    } catch (e) {
      console.error('Failed to fetch SVG cursor:', e)
      // Fallback simple SVG
      svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M4.5 3v15.2l3.8-3.8 2.9 6.8 2.4-1-2.9-6.8h5.3z" fill="black" stroke="white" stroke-width="1.5"/></svg>`
    }

    // Replace width and height attributes in SVG
    svgContent = svgContent
      .replace(/width="[^"]*"/, `width="${size}"`)
      .replace(/height="[^"]*"/, `height="${size}"`)

    // If color is customized and not default black
    if (color !== '#000000') {
      svgContent = svgContent
        .replace(/fill="#000000"/gi, `fill="${color}"`)
        .replace(/fill="#000"/gi, `fill="${color}"`)
    }

    return new Promise((resolve) => {
      const img = new Image()
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
