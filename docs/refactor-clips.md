# Refactor clips : source de vérité unique

## Décision

L’éditeur ne doit persister et consommer qu’une seule structure :

```ts
Composition { schemaVersion, assets, clips, groups }
```

`assets` décrit une source immuable. `clips` décrit toutes les unités éditables
(screen, webcam, system-audio, microphone, video, audio, image, caption).
`groups` lie les clips synchronisés. Il n’existe ni `base-video`, ni sidecar
virtuel, ni `layers/media`, ni segment global à côté des clips. Les anciennes
compositions sont refusées : aucune migration et aucun fallback ne sont permis.

La durée de composition est la fin maximale de tous les clips activés. Après la
fin de la capture écran, le canvas et l’export rendent le fond configuré et les
clips actifs restants ; aucune frame écran, thumbnail ou waveform n’est inventée.

## Ordre impératif de migration

1. Finaliser et tester `composition/engine/clip-types.ts` et `clip-engine.ts`.
   L’API pure est la seule autorisée pour split, trim, delete ripple, move,
   vitesse, activation, apparence, transform, crop, miroir, volume, detach,
   reorder, clips actifs, conversions et durée.
2. Remplacer le contrat Electron/preload/API par la nouvelle composition,
   convertir les manifests de session directement en assets/clips/groupes à
   l’ouverture, puis supprimer toutes les API de mutation par calque.
3. Réécrire `useProjectComposition.ts` comme adaptateur transactionnel du
   moteur. Une sélection est toujours un `clipId`; drag/slider créent un preview,
   une sauvegarde révisée et une seule entrée undo.
4. Basculer canvas, player audio, timeline, thumbnails, waveforms et export sur
   les requêtes du moteur. Supprimer les modules historiques seulement après que
   leurs derniers imports ont disparu.
5. Exécuter la recherche d’interdits ci-dessous, supprimer les tests historiques
   et ne garder que les tests du modèle unique.

## Inventaire des suppressions

Supprimer intégralement, avec leurs tests et tous leurs imports :

- `src/components/video-editor/composition/base-video-ranges.ts` et `.test.ts`
- `composition/delete-composition-layer.ts` et `.test.ts`
- `composition/sidecar-links.ts` et `.test.ts`
- `composition/split-composition-layers.ts` et `.test.ts`
- `composition/visual-stack.ts` et `.test.ts`
- `composition/webcam/camera-composition.ts` et `.test.ts`
- `properties/SidecarLink.vue` et `.test.ts`
- les clés i18n `SidecarLink.json` anglaises et françaises.

Supprimer les tests qui valident l’ancien rendu ou l’ancien snapshot :

- `src/components/export/composition/render.test.ts`
- `src/components/export/composition/snapshot.test.ts`
- les assertions `base-video`, `sessionSegments`, `layers`, `media`, webcam
  sidecar dans les tests timeline/canvas/audio existants.

## Fichiers à remplacer

| Zone | Fichiers | Remplacement obligatoire |
| --- | --- | --- |
| Types | `composition/composition-types.ts`, `src/api/types/capture-api.ts` | Réexporter les types `Composition`, `Clip`, `Asset`, `ClipGroup`; supprimer `ProjectComposition`, `CompositionLayer`, `CompositionMedia`. |
| Persistance | `electron/projects/composition-store.cjs`, `project-store.cjs`, `project-ipc.cjs`, `electron/preload.cjs` | Valider/persister uniquement `schemaVersion/assets/clips/groups`; garder seulement get/save/import-asset. Supprimer save/delete/move layer. |
| Etat | `composables/useProjectComposition.ts`, `useProjectEditorState.ts`, `useEditorUndoRedo.ts`, `useVideoEditor.ts` | Muter via engine, sélection réelle `clipId`, durée via `compositionDuration`, transactions et révisions de sauvegarde. |
| Canvas | `canvas/EditorCanvas.vue`, `useCompositionMedia.ts`, `useCameraZoom.ts`, `useLayerTransformAndCrop.ts`, `useCursorOverlay.ts` | Rendre `activeClipsAt`; traiter screen comme clip normal; appliquer appearance/crop/transform/mirror par clip; ne rien dessiner après la fin source. |
| Timeline | `timeline/EditorTimeline.vue`, `TimelineTracks.vue`, `TimelineVideoClip.vue`, `useTimelineTracks.ts` | Un `TimelineClip` pour tous les types. Pas de rangée base/webcam/micro synthétique; thumbnails et waveforms bornés par le clip et la source. |
| Audio | `useEditorAudio.ts`, `useCompositionAudio.ts`, `useCompositionAudioWaveforms.ts` | Créer les éléments audio depuis les clips actifs; calculer les ondes uniquement depuis un décodage réel; état explicite indisponible en cas d’échec, jamais de fallback graphique. |
| Export | `export/composition/snapshot.ts`, `render.ts`, `export-types.ts`, `mediabunny/exporter.ts` | Snapshot/export basés sur mêmes clips actifs, conversions et durée que canvas/timeline. Aucun calcul de segment local. |
| UI | `VideoEditor.vue`, `PropertiesPanel.vue`, `clip/ClipPropertiesPanel.vue`, `clip/AudioClipPropertiesPanel.vue`, captions | Afficher les capacités du clip. Les propriétés écrivent directement le clip concerné; split rend les moitiés indépendantes. |

Conserver mais simplifier : `composition/appearance/*`, `timeline/waveform/*`,
`canvas/useCanvasBackground.ts`, zoom et captions. Ils ne doivent dépendre que
des clips fournis, jamais d’un identifiant ou d’une piste virtuelle historique.

## Règles fonctionnelles non négociables

- Session : créer un groupe contenant les clips réellement disponibles screen,
  webcam, audio système et micro. Une piste absente ne crée ni clip, ni rangée,
  ni waveform.
- Import vidéo avec audio : deux clips liés. Split produit deux groupes. Toutes
  les opérations timing/vitesse sont groupées; style/crop/transform restent
  locaux au clip visuel.
- Image : durée initiale 5 secondes, fin étirable sans limite; pas de vitesse.
- Vidéo/audio : fin étirable jusqu’à la durée source disponible, jamais au-delà.
- Delete : supprime le groupe courant, ripple les clips suivants, positionne le
  playhead sur le prochain clip actif ou la fin si la composition est vide.
- Après split, frame, shadow, crop, transform et miroir d’une moitié ne touchent
  jamais l’autre moitié.
- Aucun placeholder : thumbnail/waveform/frame seulement si le média réel est
  décodable et dans son intervalle source.

## Recherche de fin de migration

La commande suivante doit retourner zéro résultat dans le code de production :

```sh
rg 'baseVideo|sessionSegments|CompositionLayer|CompositionMedia|ProjectComposition|sidecar|visualTrackOrder|activeLayersAt' src electron
```

Les exceptions sont interdites. Toute occurrence restante bloque la migration.

## Tests de réception

- Moteur : clips seuls, groupes, détachés, limites invalides, composition vide,
  trims ré-étendus, split de session/import, delete ripple, conversions à
  vitesses différentes et ordre de pistes.
- IPC/store : accepte exclusivement le schéma unique, rejette tout champ legacy,
  n’expose aucune mutation de layer.
- Canvas/timeline/export : mêmes clips actifs, source time et durée; appearance
  visible immédiatement et après sauvegarde; aucune frame après source.
- Média importé : vidéo/audio de 60 s placé à 50 s après une capture de 14 s;
  durée finale 110 s, onde réelle, export et lecture jusqu’à 110 s.
- Transactions : drag/slider = preview fluide, une sauvegarde, un undo; réponse
  de sauvegarde ancienne ignorée.

Vérifications finales : tests Node, Vitest avec couverture, build TypeScript,
`rg` d’interdits ci-dessus, puis suppression des fichiers listés dans ce document.
