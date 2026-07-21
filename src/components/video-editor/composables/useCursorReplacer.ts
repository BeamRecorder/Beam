import { ref } from 'vue'

export type CursorType =
  | 'automatic'
  | 'default'
  | 'beachball'
  | 'busy'
  | 'cell'
  | 'contextualmenu'
  | 'copy'
  | 'cross'
  | 'handgrabbing'
  | 'handopen'
  | 'handpointing'
  | 'help'
  | 'makealias'
  | 'move'
  | 'notallowed'
  | 'poof'
  | 'resizenorth'
  | 'resizenortheast'
  | 'resizenortheastsouthwest'
  | 'resizenorthsouth'
  | 'resizenorthwest'
  | 'resizenorthwestsoutheast'
  | 'resizeright'
  | 'resizesouth'
  | 'resizesoutheast'
  | 'resizesouthwest'
  | 'resizeup'
  | 'resizeupdown'
  | 'resizewest'
  | 'resizewesteast'
  | 'screenshotselection'
  | 'screenshotwindow'
  | 'textcursor'
  | 'textcursorvertical'
  | 'zoomin'
  | 'zoomout'

export const cursorUrls: Record<CursorType, string> = {
  automatic: '',
  default: '/macOsSvgCursors/default.svg',
  beachball: '/macOsSvgCursors/beachball.svg',
  busy: '/macOsSvgCursors/busy.svg',
  cell: '/macOsSvgCursors/cell.svg',
  contextualmenu: '/macOsSvgCursors/contextualmenu.svg',
  copy: '/macOsSvgCursors/copy.svg',
  cross: '/macOsSvgCursors/cross.svg',
  handgrabbing: '/macOsSvgCursors/handgrabbing.svg',
  handopen: '/macOsSvgCursors/handopen.svg',
  handpointing: '/macOsSvgCursors/handpointing.svg',
  help: '/macOsSvgCursors/help.svg',
  makealias: '/macOsSvgCursors/makealias.svg',
  move: '/macOsSvgCursors/move.svg',
  notallowed: '/macOsSvgCursors/notallowed.svg',
  poof: '/macOsSvgCursors/poof.svg',
  resizenorth: '/macOsSvgCursors/resizenorth.svg',
  resizenortheast: '/macOsSvgCursors/resizenortheast.svg',
  resizenortheastsouthwest: '/macOsSvgCursors/resizenortheastsouthwest.svg',
  resizenorthsouth: '/macOsSvgCursors/resizenorthsouth.svg',
  resizenorthwest: '/macOsSvgCursors/resizenorthwest.svg',
  resizenorthwestsoutheast: '/macOsSvgCursors/resizenorthwestsoutheast.svg',
  resizeright: '/macOsSvgCursors/resizeright.svg',
  resizesouth: '/macOsSvgCursors/resizesouth.svg',
  resizesoutheast: '/macOsSvgCursors/resizesoutheast.svg',
  resizesouthwest: '/macOsSvgCursors/resizesouthwest.svg',
  resizeup: '/macOsSvgCursors/resizeup.svg',
  resizeupdown: '/macOsSvgCursors/resizeupdown.svg',
  resizewest: '/macOsSvgCursors/resizewest.svg',
  resizewesteast: '/macOsSvgCursors/resizewesteast.svg',
  screenshotselection: '/macOsSvgCursors/screenshotselection.svg',
  screenshotwindow: '/macOsSvgCursors/screenshotwindow.svg',
  textcursor: '/macOsSvgCursors/textcursor.svg',
  textcursorvertical: '/macOsSvgCursors/textcursorvertical.svg',
  zoomin: '/macOsSvgCursors/zoomin.svg',
  zoomout: '/macOsSvgCursors/zoomout.svg',
}

export const cursorOptions = [
  { value: 'automatic', label: 'Automatic (Recommended)', thumbnail: '/macOsSvgCursors/default.svg' },
  { value: 'default', label: 'macOS Pointer', thumbnail: '/macOsSvgCursors/default.svg' },
  { value: 'beachball', label: 'macOS Beachball (Busy)', thumbnail: '/macOsSvgCursors/beachball.svg' },
  { value: 'busy', label: 'macOS Busy Loader', thumbnail: '/macOsSvgCursors/busy.svg' },
  { value: 'cell', label: 'macOS Cell Selection', thumbnail: '/macOsSvgCursors/cell.svg' },
  { value: 'contextualmenu', label: 'macOS Context Menu', thumbnail: '/macOsSvgCursors/contextualmenu.svg' },
  { value: 'copy', label: 'macOS Copy Pointer', thumbnail: '/macOsSvgCursors/copy.svg' },
  { value: 'cross', label: 'macOS Crosshair', thumbnail: '/macOsSvgCursors/cross.svg' },
  { value: 'handgrabbing', label: 'macOS Grabbing Hand', thumbnail: '/macOsSvgCursors/handgrabbing.svg' },
  { value: 'handopen', label: 'macOS Open Hand', thumbnail: '/macOsSvgCursors/handopen.svg' },
  { value: 'handpointing', label: 'macOS Link Hand', thumbnail: '/macOsSvgCursors/handpointing.svg' },
  { value: 'help', label: 'macOS Help Indicator', thumbnail: '/macOsSvgCursors/help.svg' },
  { value: 'makealias', label: 'macOS Make Alias', thumbnail: '/macOsSvgCursors/makealias.svg' },
  { value: 'move', label: 'macOS Move Cursor', thumbnail: '/macOsSvgCursors/move.svg' },
  { value: 'notallowed', label: 'macOS Not Allowed', thumbnail: '/macOsSvgCursors/notallowed.svg' },
  { value: 'poof', label: 'macOS Poof Animation', thumbnail: '/macOsSvgCursors/poof.svg' },
  { value: 'resizenorth', label: 'macOS Resize North', thumbnail: '/macOsSvgCursors/resizenorth.svg' },
  { value: 'resizenortheast', label: 'macOS Resize Northeast', thumbnail: '/macOsSvgCursors/resizenortheast.svg' },
  { value: 'resizenortheastsouthwest', label: 'macOS Resize NE-SW', thumbnail: '/macOsSvgCursors/resizenortheastsouthwest.svg' },
  { value: 'resizenorthsouth', label: 'macOS Resize North-South', thumbnail: '/macOsSvgCursors/resizenorthsouth.svg' },
  { value: 'resizenorthwest', label: 'macOS Resize Northwest', thumbnail: '/macOsSvgCursors/resizenorthwest.svg' },
  { value: 'resizenorthwestsoutheast', label: 'macOS Resize NW-SE', thumbnail: '/macOsSvgCursors/resizenorthwestsoutheast.svg' },
  { value: 'resizeright', label: 'macOS Resize Right', thumbnail: '/macOsSvgCursors/resizeright.svg' },
  { value: 'resizesouth', label: 'macOS Resize South', thumbnail: '/macOsSvgCursors/resizesouth.svg' },
  { value: 'resizesoutheast', label: 'macOS Resize Southeast', thumbnail: '/macOsSvgCursors/resizesoutheast.svg' },
  { value: 'resizesouthwest', label: 'macOS Resize Southwest', thumbnail: '/macOsSvgCursors/resizesouthwest.svg' },
  { value: 'resizeup', label: 'macOS Resize Up', thumbnail: '/macOsSvgCursors/resizeup.svg' },
  { value: 'resizeupdown', label: 'macOS Resize Up-Down', thumbnail: '/macOsSvgCursors/resizeupdown.svg' },
  { value: 'resizewest', label: 'macOS Resize West', thumbnail: '/macOsSvgCursors/resizewest.svg' },
  { value: 'resizewesteast', label: 'macOS Resize West-East', thumbnail: '/macOsSvgCursors/resizewesteast.svg' },
  { value: 'screenshotselection', label: 'macOS Select Screenshot', thumbnail: '/macOsSvgCursors/screenshotselection.svg' },
  { value: 'screenshotwindow', label: 'macOS Window Screenshot', thumbnail: '/macOsSvgCursors/screenshotwindow.svg' },
  { value: 'textcursor', label: 'macOS Text I-Beam', thumbnail: '/macOsSvgCursors/textcursor.svg' },
  { value: 'textcursorvertical', label: 'macOS Vertical Text I-Beam', thumbnail: '/macOsSvgCursors/textcursorvertical.svg' },
  { value: 'zoomin', label: 'macOS Zoom In', thumbnail: '/macOsSvgCursors/zoomin.svg' },
  { value: 'zoomout', label: 'macOS Zoom Out', thumbnail: '/macOsSvgCursors/zoomout.svg' },
]

export function useCursorReplacer() {
  const selectedCursor = ref<CursorType>('automatic')
  const cursorSize = ref(24)
  const cursorColor = ref('#000000')
  const enableShadow = ref(true)
  const enableRipple = ref(true)
  const shadowBlur = ref(6)
  const shadowColor = ref('#000000')
  const rippleColor = ref('#ff5a1f')
  const rippleSize = ref(30)

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
    shadowBlur,
    shadowColor,
    rippleColor,
    rippleSize,
    getCursorImage,
  }
}

