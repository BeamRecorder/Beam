Réfléchi pendant 1m 53s

Oui. La logique de Recordly est assez simple : la webcam est dessinée dans l’espace écran, en dehors du container qui zoome la vidéo, puis sa taille est multipliée par l’inverse du zoom courant.

Donc :

zoom vidéo = 1.0× → webcam = 100 %
zoom vidéo = 1.5× → webcam = 66,7 %
zoom vidéo = 2.0× → webcam = 50 %
zoom vidéo = 3.5× → webcam = 28,6 %

Quand le zoom entre, la webcam rétrécit. Quand le zoom ressort vers 1×, elle s’agrandit de nouveau. Comme Recordly utilise l’échelle réellement appliquée par le ressort, le changement de taille suit exactement l’animation du zoom.

Toute la logique copiable
1. Types et valeurs par défaut
export type WebcamPositionPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom'

export interface WebcamOverlaySettings {
  enabled: boolean

  widthPercent: number
  heightPercent: number

  margin: number
  reactToZoom: boolean

  positionPreset: WebcamPositionPreset
  positionX: number
  positionY: number

  cornerRadius: number
  shadowOpacity: number
  mirror: boolean
}

export const DEFAULT_WEBCAM_SETTINGS: WebcamOverlaySettings = {
  enabled: false,

  widthPercent: 40,
  heightPercent: 40,

  margin: 24,
  reactToZoom: true,

  positionPreset: 'bottom-right',
  positionX: 1,
  positionY: 1,

  cornerRadius: 90,
  shadowOpacity: 0.67,
  mirror: true,
}

Les valeurs Recordly sont notamment une taille de 40, une marge de 24, reactToZoom: true, un placement en bas à droite, une ombre de 0.67 et un rayon de 90.

2. Facteur de réaction au zoom

C’est le cœur du comportement :

export function getWebcamZoomFactor(
  appliedZoomScale: number,
  reactToZoom: boolean,
): number {
  const safeScale =
    Number.isFinite(appliedZoomScale) &&
    appliedZoomScale > 0
      ? appliedZoomScale
      : 1

  return reactToZoom
    ? 1 / safeScale
    : 1
}

Important : il faut lui transmettre l’échelle finale actuellement rendue, pas le niveau de zoom cible.

Utilise donc :

appliedScale

et non :

targetZoomScale

Chez Recordly, appliedScale est la valeur sortie du ressort sur la frame courante.

3. Calcul de la taille

Recordly calcule la taille à partir de la plus petite dimension du canvas :

const MIN_WEBCAM_SIZE_PX = 56

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, value))
}

export function getWebcamDimensionPx({
  containerWidth,
  containerHeight,
  sizePercent,
  margin,
  appliedZoomScale,
  reactToZoom,
}: {
  containerWidth: number
  containerHeight: number
  sizePercent: number
  margin: number
  appliedZoomScale: number
  reactToZoom: boolean
}): number {
  const minDimension = Math.min(
    containerWidth,
    containerHeight,
  )

  const safePercent = clamp(
    sizePercent,
    10,
    100,
  )

  const safeMargin = Math.max(0, margin)

  const maximumSize = Math.max(
    MIN_WEBCAM_SIZE_PX,
    minDimension - safeMargin * 2,
  )

  const zoomFactor = getWebcamZoomFactor(
    appliedZoomScale,
    reactToZoom,
  )

  const requestedSize =
    minDimension *
    (safePercent / 100) *
    zoomFactor

  return clamp(
    requestedSize,
    MIN_WEBCAM_SIZE_PX,
    maximumSize,
  )
}

Puis largeur et hauteur sont calculées séparément :

export function getWebcamDimensions({
  containerWidth,
  containerHeight,
  widthPercent,
  heightPercent,
  margin,
  appliedZoomScale,
  reactToZoom,
}: {
  containerWidth: number
  containerHeight: number
  widthPercent: number
  heightPercent: number
  margin: number
  appliedZoomScale: number
  reactToZoom: boolean
}) {
  return {
    width: getWebcamDimensionPx({
      containerWidth,
      containerHeight,
      sizePercent: widthPercent,
      margin,
      appliedZoomScale,
      reactToZoom,
    }),

    height: getWebcamDimensionPx({
      containerWidth,
      containerHeight,
      sizePercent: heightPercent,
      margin,
      appliedZoomScale,
      reactToZoom,
    }),
  }
}

C’est la même structure que celle utilisée par Recordly, avec une taille minimale de 56 px.

4. Positionnement qui reste collé aux bords

Le preset est converti en coordonnées normalisées :

export function getPresetAnchor(
  preset: WebcamPositionPreset,
): { x: number; y: number } {
  switch (preset) {
    case 'top-left':
      return { x: 0, y: 0 }

    case 'top-center':
      return { x: 0.5, y: 0 }

    case 'top-right':
      return { x: 1, y: 0 }

    case 'center-left':
      return { x: 0, y: 0.5 }

    case 'center':
      return { x: 0.5, y: 0.5 }

    case 'center-right':
      return { x: 1, y: 0.5 }

    case 'bottom-left':
      return { x: 0, y: 1 }

    case 'bottom-center':
      return { x: 0.5, y: 1 }

    case 'bottom-right':
    default:
      return { x: 1, y: 1 }
  }
}

Puis, à chaque nouvelle taille, la position est recalculée :

export function getWebcamPosition({
  containerWidth,
  containerHeight,
  overlayWidth,
  overlayHeight,
  margin,
  preset,
  customX,
  customY,
}: {
  containerWidth: number
  containerHeight: number
  overlayWidth: number
  overlayHeight: number
  margin: number
  preset: WebcamPositionPreset
  customX?: number
  customY?: number
}) {
  const safeMargin = Math.max(0, margin)

  const availableWidth = Math.max(
    0,
    containerWidth -
      overlayWidth -
      safeMargin * 2,
  )

  const availableHeight = Math.max(
    0,
    containerHeight -
      overlayHeight -
      safeMargin * 2,
  )

  const anchor =
    preset === 'custom'
      ? {
          x: clamp(customX ?? 1, 0, 1),
          y: clamp(customY ?? 1, 0, 1),
        }
      : getPresetAnchor(preset)

  return {
    x:
      safeMargin +
      availableWidth * anchor.x,

    y:
      safeMargin +
      availableHeight * anchor.y,
  }
}

Recordly recalcule la position après avoir recalculé la taille. C’est ce qui permet à la webcam de rester collée au même bord malgré son agrandissement ou sa réduction.

Pour un placement bottom-right, cela revient à :

x = containerWidth - overlayWidth - margin
y = containerHeight - overlayHeight - margin

Donc, quand la webcam rétrécit, son coin inférieur droit ne bouge pas, mais son coin supérieur gauche se déplace vers le bas et la droite.

C’est probablement le mouvement que tu observes.

5. Mise à jour complète à chaque frame
export interface WebcamLayout {
  x: number
  y: number
  width: number
  height: number
}

export function computeWebcamLayout({
  canvasWidth,
  canvasHeight,
  appliedZoomScale,
  settings,
}: {
  canvasWidth: number
  canvasHeight: number
  appliedZoomScale: number
  settings: WebcamOverlaySettings
}): WebcamLayout {
  const dimensions = getWebcamDimensions({
    containerWidth: canvasWidth,
    containerHeight: canvasHeight,

    widthPercent: settings.widthPercent,
    heightPercent: settings.heightPercent,

    margin: settings.margin,
    appliedZoomScale,
    reactToZoom: settings.reactToZoom,
  })

  const position = getWebcamPosition({
    containerWidth: canvasWidth,
    containerHeight: canvasHeight,

    overlayWidth: dimensions.width,
    overlayHeight: dimensions.height,

    margin: settings.margin,
    preset: settings.positionPreset,

    customX: settings.positionX,
    customY: settings.positionY,
  })

  return {
    x: position.x,
    y: position.y,
    width: dimensions.width,
    height: dimensions.height,
  }
}

Dans ta boucle de rendu :

function renderFrame() {
  const zoomTransform =
    updateZoomAnimation()

  drawScreenWithZoom(zoomTransform)

  const webcamLayout =
    computeWebcamLayout({
      canvasWidth,
      canvasHeight,

      // Très important :
      appliedZoomScale:
        zoomTransform.appliedScale,

      settings: webcamSettings,
    })

  drawWebcam(
    webcamLayout,
    webcamFrame,
    webcamSettings,
  )
}

Recordly appelle cette mise à jour à chaque tick immédiatement après avoir appliqué la transformation du zoom.

6. Ordre des layers

Pour avoir exactement le même comportement, l’ordre est crucial :

1. background
2. écran avec zoom
3. ombre de l’écran
4. webcam en espace écran
5. annotations/captions

Ne mets pas la webcam dans le container qui subit :

scale(appliedZoomScale)
translate(zoomX, zoomY)

Sinon elle grossira avec la vidéo.

Chez Recordly, l’export dessine d’abord le canvas vidéo transformé, puis appelle séparément le rendu webcam sur le canvas composite.

Structure recommandée :

const sceneContainer = new Container()
const videoContainer = new Container()
const cursorContainer = new Container()

sceneContainer.addChild(
  videoContainer,
  cursorContainer,
)

// Subit le zoom.
sceneContainer.scale.set(appliedScale)
sceneContainer.position.set(zoomX, zoomY)

// Ne subit pas directement le zoom.
const webcamLayer = new Container()
stage.addChild(sceneContainer)
stage.addChild(webcamLayer)

Puis la webcam reçoit uniquement la compensation :

webcamLayer.width =
  baseWebcamWidth / appliedScale

webcamLayer.height =
  baseWebcamHeight / appliedScale

Cependant, Recordly ne fait pas littéralement un scale = 1 / zoom sur un container. Il recalcule la largeur, la hauteur et la position finales en pixels.

7. Version DOM pour ton preview Vue
export function applyWebcamElementLayout({
  element,
  innerElement,
  canvasElement,
  appliedZoomScale,
  settings,
}: {
  element: HTMLElement
  innerElement: HTMLElement
  canvasElement: HTMLElement
  appliedZoomScale: number
  settings: WebcamOverlaySettings
}) {
  if (!settings.enabled) {
    element.style.display = 'none'
    return
  }

  const layout = computeWebcamLayout({
    canvasWidth: canvasElement.clientWidth,
    canvasHeight: canvasElement.clientHeight,
    appliedZoomScale,
    settings,
  })

  element.style.display = 'block'
  element.style.position = 'absolute'

  element.style.left = `${layout.x}px`
  element.style.top = `${layout.y}px`
  element.style.width = `${layout.width}px`
  element.style.height = `${layout.height}px`

  const shadowSize = Math.min(
    layout.width,
    layout.height,
  )

  element.style.filter = [
    'drop-shadow(',
    `0 ${Math.round(shadowSize * 0.06)}px `,
    `${Math.round(shadowSize * 0.22)}px `,
    `rgba(0, 0, 0, ${settings.shadowOpacity})`,
    ')',
  ].join('')

  innerElement.style.overflow = 'hidden'

  const radius = Math.min(
    settings.cornerRadius,
    layout.width / 2,
    layout.height / 2,
  )

  innerElement.style.borderRadius =
    `${radius}px`
}

Recordly ajuste également la force visuelle de l’ombre en fonction de la taille de la webcam : offset environ 6 % et blur environ 22 % de sa plus petite dimension.

8. Version Canvas pour l’export
export function drawWebcamOverlay(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  appliedZoomScale: number,
  settings: WebcamOverlaySettings,
) {
  if (!settings.enabled) {
    return
  }

  const layout = computeWebcamLayout({
    canvasWidth,
    canvasHeight,
    appliedZoomScale,
    settings,
  })

  const buffer = document.createElement('canvas')

  buffer.width = Math.max(
    1,
    Math.ceil(layout.width),
  )

  buffer.height = Math.max(
    1,
    Math.ceil(layout.height),
  )

  const bufferCtx = buffer.getContext('2d')

  if (!bufferCtx) {
    return
  }

  bufferCtx.imageSmoothingEnabled = true
  bufferCtx.imageSmoothingQuality = 'high'

  const radius = Math.min(
    Math.max(0, settings.cornerRadius),
    layout.width / 2,
    layout.height / 2,
  )

  roundedRect(
    bufferCtx,
    0,
    0,
    layout.width,
    layout.height,
    radius,
  )

  bufferCtx.clip()

  if (settings.mirror) {
    bufferCtx.translate(layout.width, 0)
    bufferCtx.scale(-1, 1)
  }

  drawImageCover(
    bufferCtx,
    source,
    layout.width,
    layout.height,
  )

  ctx.save()

  if (settings.shadowOpacity > 0) {
    const shadowSize = Math.min(
      layout.width,
      layout.height,
    )

    ctx.filter =
      `drop-shadow(` +
      `0 ${Math.round(shadowSize * 0.06)}px ` +
      `${Math.round(shadowSize * 0.22)}px ` +
      `rgba(0, 0, 0, ${settings.shadowOpacity})` +
      `)`
  }

  ctx.drawImage(
    buffer,
    layout.x,
    layout.y,
    layout.width,
    layout.height,
  )

  ctx.restore()
}

L’export Recordly utilise lui aussi animationState.appliedScale, recalcule les dimensions et la position, dessine dans un canvas intermédiaire, applique le crop, le miroir, le masque et enfin l’ombre.

9. Pourquoi cela peut paraître irrégulier

Recordly n’utilise pas directement :

targetScale

Il utilise :

springScale

La webcam suit donc cette séquence :

zoom demandé à 1.8×
        ↓
ressort : 1.0 → 1.19 → 1.43 → 1.64 → 1.77 → 1.8
        ↓
webcam : 1/1.0 → 1/1.19 → 1/1.43 → ... → 1/1.8

Lors du zoom-out :

zoom :   1.8 → 1.6 → 1.35 → 1.14 → 1.0
webcam : 56% → 62% → 74% → 88% → 100%

Le zoom est animé par un ressort pendant la lecture. En pause, pendant un seek ou en mode classique, Recordly saute directement vers la transformation projetée au lieu d’utiliser le ressort. La webcam peut donc parfois changer de taille instantanément dans ces situations.