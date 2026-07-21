2. Capture des données du curseur
Échantillonnage

Recordly enregistre le curseur environ toutes les 33 ms, soit approximativement 30 Hz. Il limite le sidecar à une heure de données à cette fréquence.

Ils utilisent un setTimeout récursif avec compensation de dérive plutôt qu’un setInterval. Quand le processus prend du retard, ils déplacent la prochaine échéance au lieu d’essayer de rattraper les échantillons en rafale.

Chaque point ressemble à ceci :

interface CursorTelemetryPoint {
  timeMs: number
  cx: number
  cy: number
  interactionType?: 'move' | 'click' | 'double-click'
    | 'right-click' | 'middle-click' | 'mouseup'
  cursorType?: string
}

Les positions cx et cy sont normalisées entre 0 et 1 relativement à l’écran ou à la fenêtre enregistrée. Recordly tient compte des bounds de la source et, selon la plateforme, du scale factor.

Détection des clics

Recordly utilise uiohook-napi pour recevoir les événements globaux :

mousedown ;
mouseup ;
clic droit ;
clic milieu ;
double clic.

Un double clic est reconnu lorsque deux clics gauches sont séparés de moins de 350 ms et de moins de 0,04 unité normalisée.

Le résultat est sauvegardé à côté de la vidéo sous forme de JSON :

{
  "version": 2,
  "samples": []
}

Cette partie est directement compatible avec l’architecture de sidecars que tu prévois.

3. Comment les auto-zooms sont générés

Le fichier principal est :

src/components/video-editor/timeline/zoomSuggestionUtils.ts

Le code contient beaucoup de heuristiques :

dwell de 450 à 2600 ms ;
curseur presque immobile ;
clic dans un champ texte ;
sélection de texte ;
ouverture probable d’un menu déroulant ;
double clic synthétique.

Mais dans le chemin actuellement utilisé, il y a une nuance importante :

les suggestions finales ne conservent que les interactions explicites issues des clics.

Les candidats provenant des dwell heuristiques sont calculés, puis filtrés avant la création des régions.

Regroupement des clics

Les clics sont regroupés tant que deux clics consécutifs sont espacés de moins de :

2500 ms

Une marge de :

500 ms avant le premier clic
500 ms après le dernier clic

est ajoutée à la région.

Exemple :

clic à 4,0 s
clic à 5,2 s
clic à 6,0 s

écarts < 2,5 s
→ un seul cluster
→ région de 3,5 s à 6,5 s

Le focus choisi est celui du clic auquel l’heuristique attribue la plus grande importance. En l’absence d’un tel clic, le code peut utiliser le centroïde des positions du cluster.

Les régions qui chevauchent un zoom existant sont simplement ignorées.

Structure obtenue
interface ZoomRegion {
  id: string
  startMs: number
  endMs: number
  depth: 1 | 2 | 3 | 4 | 5 | 6
  focus: {
    cx: number
    cy: number
  }
  mode?: 'auto' | 'manual'
}

Les niveaux correspondent à :

const ZOOM_DEPTH_SCALES = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5.0,
}

Le zoom automatique utilise par défaut la profondeur 2, donc 1.5×.

4. Enveloppe temporelle du zoom

Le fichier est :

src/components/video-editor/videoPlayback/zoomRegionUtils.ts

Le zoom ne commence pas brutalement au startMs et ne finit pas brutalement au endMs. Une fonction calcule une intensité entre 0 et 1 :

0 → zoom-in → 1 → maintien → zoom-out → 0

Les valeurs principales sont :

durée zoom-in  = 1522,575 ms
durée zoom-out = 1015,05 ms
anticipation   = 200 ms
overlap entrée = 1000 ms
zoom-out       = commence 500 ms avant endMs

La progression utilise :

cubicBezier(0.16, 1, 0.3, 1, t)

C’est une courbe ease-out très agressive au-out très agress début, puis très dou71file0L63-L65

Le calcul conceptuel est :

function regionStrength(region: ZoomRegion, timeMs: number) {
  if (timeMs est dans l’entrée) {
    return easeOutZoom(entryProgress)
  }

  if (timeMs est dans le maintien) {
    return 1
  }

  if (timeMs est dans la sortie) {
    return 1 - easeOutZoom(exitProgress)
  }

  return 0
}

Les fenêtres trop courtes sont partagées autour d’un midpoint afin que le zoom-in et le zoom-out ne se chevauchent pas 65file0L39-L74

Zooms connectés

Quand l’option est active, deux régions séparées de moins de 1350 ms sont considérées comme connectées. Le système maintient alors le zoom et prépare le focus de la région suivante au lieu de revenir compl5file0L80-L103

Cependant, le type ConnectedPanTransition existe mais la fonction renvoie toujours transition: null. Le déplacement entre deux cibles est actuellement laissé au ressort général plutôt qu’à une trafile0L189-L212

Il y a aussi une incohérence : les paramètres publics définissent un gap connecté par défaut de 1500 ms, alors que zoomRegionUtils.ts utilise directement 1350 ms. Plusieurs réglages de durée et d’easing connectés ne sont pas transmis à findDominantRegion dans le chffile0L187-L195

C’est un exemple du code “horrible” ou au moins désordonné que tu avais remarqué.

5. Choix du focus
Limiter la caméra aux bords

Pour un zoom scale, le focus doit rester dans :

minimum = 1 / (2 × scale)
maximum = 1 - minimum

À 2× :

focus X/Y ∈ [0.25, 0.75]

Cela empêche la caméra d’afficher une zone située ho72file0L44-L80

Suivi dynamique du curseur

Dans une région automatique, le focus initial vient du cluster de clics. Mais pendant la lecture, Recordly peut continuer à suivre le curseur.

La caméra possède une safe zone interne. Tant que le curseur reste dans cette zone, le focus ne bouge pas. Lorsqu’il sort :

focusX = cursorX, seulement si le curseur sort horizontalement
focusY = cursorY, seulement s’il sort verticalement

Le résultat est ensuite clampé selon le 3file0L82-L123

Cela évite une caméra constamment attachée au curseur et donc tremblante.

Pendant le zoom-out, après que le zoom a atteint une force proche de 1, Recordly gèle le dernier focus. La caméra ne repart donc pas vers une nouvelle position pendant qfile0L134-L203

C’est une bonne décision à reprendre.

6. Transformation géométrique

Le fichier exact est :

src/components/video-editor/videoPlayback/zoomTransform.ts

Recordly ne recadre pas la vidéo source à chaque frame. Il applique une transformation au Container PixiJS contenant la vidéo.

Le calcul est :

const focusPxX = baseMask.x + focusX * baseMask.width
const focusPxY = baseMask.y + focusY * baseMask.height

const scale = 1 + (zoomScale - 1) * progress

const finalX = stageCenterX - focusPxX * zoomScale
const finalY = stageCenterY - focusPxY * zoomScale

return {
  scale,
  x: finalX * progress,
  y: finalY * p4file0L74-L105

Puis :

```ts
cameraContainer.scale.set(transform.scale)
cameraContainer.position.set(transform.x, trfile0L135-L177

### Petite faiblesse mathématique

La translation finale est calculée avec le `zoomScale` final, puis multipliée par `progress`, tandis que l’échelle est interpolée séparément.

La formulation géométriquement exacte serait plutôt de recalculer la translation avec le `scale` interpolé :

```ts
const scale = lerp(1, zoomScale, progress)

const x = stageCenterX - focusPxX * scale
const y = stageCenterY - focusPxY * scale

La version Recordly fonctionne visuellement, mais elle n’assure pas strictement que le focus reste au même point pendant toute la transition.

7. Le ressort

Une fois la transformation théorique calculée, Recordly ne l’applique pas directement pendant la lecture moderne.

Il anime séparément :

scale
x
y

avec trois états de ressorfile0L249-L305

Le solveur est une solution analytique de l’oscillateur masse-ressort-amortisseur :

F = -kx - cv

ω₀ = √(k / m)
ζ  = c / (2√(km))

Il possède des solutions distinctes pour :

sous-amorti ;
amortissement critique 9file0L77-L138

Il transporte la vitesse d’une frame à la suivante et utilise une protection contre l’overshoot pour les configurations critiques ou sur-amorties. Le delta temporel est limité enfile0L140-L221

Avec la smoothness par défaut 0.5, la configuration obtenue est environ :

stiffness = 100
damping   = 21
mass      = 1

La formule générale est :

scaled = smoothness * 2

stiffness = 100 / scaled
damping = 21
masfile0L277-L309

## Double lissage

Recordly cumule en réalité :

1. une courbe cubic-bezier pour l’intensité de région ;
2. un ressort sur la transformation résultante.

Cela donne un mouvement très doux, mais peut aussi donner une sensation un peu molle ou difficile à régler.

## Problème de déterminisme

Le preview utilise :

```ts
performance.now()

et des états de ressort mutables avancés frame par frame. Pendant une pause, un seek ou le mode classique, les ressorts sont réinitialisés et la transformation est appliquffile0L258-L305

J’en déduis que cette architecture n’assure pas naturellement qu’un seek direct à 8 secondes produise exactement le même état qu’une lecture séquentielle jusqu’à 8 secondes. Pour ton application, une timeline précalculée ou une simulation déterministe depuis des checkpoints serait plus propre.

8. Motion blur de la caméra

Recordly utilise deux filtres de pixi-filters :

MotionBlurFilter
Zoomn63file0L3-L10

Leur “sauce” consiste surtout à choisir :

- lequel utiliser ;
- son vecteur ;
- son centre ;
- sa force.

Le noyau GPU lui-même vient de Pixi Filters.

## Analyse entre deux frames

Recordly reconstruit un quadrilatère représentant le rectangle vidéo transformé :

- quatre coins ;
- centre ;
- largeur/hauteurfile0L129-L162

Il compare ensuite le rectangle actuel au précédent.

Pour le déplacement :

```text
moveDelta = currentCenter - previousCenter
moveVelocity = length(moveDelta) / dt

Pour le zoom :

zoomVelocity =
  abs(log(currentDiagonal / previousDiagonal)) / dt

Si les deux sont actifs, Recordly compare la variation de taille et le déplacement du centre pour choisir entre :

move blurfile0L291-L324

## Centre du blur radial

Pour retrouver l’origine du zoom, Recordly trace les trajectoires des coins entre les deux frames et cherche l’intersection de deux de ces lignes.

Cette intersection devient le centre du `ZoomBlurFilter`. Si aucune intersection utile n’existe, le centre actufile0L173-L245

C’est une approche géométrique raisonnable.

## Blur directionnel

Recordly configure :

```text
kernelSize = 13
velocity   = déplacement de la caméra × intensité
offset     = -longueurDuVe64file0L16-L71

Le shader de Pixi Filters convertit le vecteur en UV, échantillonne la texture plusieurs fois le long de cette direction, puis moyenne le08file0L24-L45

## Blur radial

Recordly donne au filtre :

```ts
zoomBlurFilter.center = inferredCenter
zoomBlurFilter.strength = zoomStrength
zoomBlurFilter.innerRadius = 0
zoomBlurFilter.radius = -1

Le rayon -1 signifie que l’effet n’a pas de lim64file0L53-L71

Le ZoomBlurFilter utilise par défaut jusqu’à 10file0L50-L57

Son shader :

calcule la direction entre chaque pixel et le centre ;
multiplie cette direction par la force ;
utilise une phase aléatoire par pixel pour masquer le banding ;
prend jusqu’à 32 échantillons ;
leur applique un poids parabolique :
weight = 4 × (percent -11file0L39-L96

## Normalisation FPS

L’intensité est multipliée par :

```text
fps / 60

Ainsi, le déplacement par frame est compensé lorsque le frfile0L247-L270

Paramètres par défaut
zoomMotionBlur = 0.35

motionBlurTuning = {
  panVelocityThreshold: 0,
  zoomVelocityThreshold: 0,
  maxDirectionalBlurPx: 41.8,
  maxRadialBlurStrength: 1,
  panResponsePerSecond: 11,
  zoomResponsePerSecond: 9,
  zoomSafeZoneRadifile0L150-L176

Mais plusieurs noms sont trompeurs :

- `maxDirectionalBlurPx` sert actuellement de multiplicateur relatif, pas réellement de maximum ;
- `panResponsePerSecond` et `zoomResponsePerSecond` ne sont pas utilisés dans `zoomTransform.ts` ;
- `zoomSafeZoneRadiusPx` n’est pas utilisé dans ce chemin non plus ;
- les seuils de vélocité valent zéro par défaut.

Donc leur type expose davantage de tuning que l’algorithme effectif n’en consomme.

---

# 9. Motion blur temporel

Le code contient un système expérimental permettant de rendre plusieurs sous-échantillons temporels par frame.

Mais il est actuellement désactivé :

```ts
const TEMPORAL_ZOOM_MOTION_BLUR_ENABL89file0L86-L89

Le motion blur actif est donc essentiellement :

```text
variation transform frame N-1 → frame N
        ↓
filtre spatial Pixi sur la frame N

Ce n’est pas un véritable shutter temporel composant plusieurs états de la scène.