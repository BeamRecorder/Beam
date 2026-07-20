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
    const response = await fetch(urlPath)
    if (!response.ok) {
      throw new Error(`Unable to load cursor asset: ${urlPath} (${response.status})`)
    }
    svgContent = await response.text()

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

    return new Promise((resolve, reject) => {
      const img = new Image()
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error(`Unable to decode cursor asset: ${urlPath}`))
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
