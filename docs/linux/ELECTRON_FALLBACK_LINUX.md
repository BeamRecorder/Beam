
  # Routage de capture multiplateforme et fallback Electron Linux

  ## Résumé

  Créer un routeur de recorder unique qui choisit, avant toute session :

  - Windows : recorder Rust natif, avec le nom réel de son backend.
  - macOS : recorder Rust natif, avec le nom réel de son backend.
  - Linux : fallback Electron.
  - Tout autre Unix ou moteur Rust introuvable/incompatible : fallback Electron.

  Le fallback produit les mêmes dossiers, manifeste v2, horloge de session et contrats de données que le recorder natif. Sous Linux, la vidéo contient toujours le curseur :
  c’est la source fiable. Sous X11, un helper natif ajoute une télémétrie réelle de position, clics et forme du curseur, mais l’éditeur ne redessine jamais ce curseur par-
  dessus la vidéo.

  ## Architecture et contrats

  - Ajouter electron/platform/platform.cjs comme unique source de vérité :
      - famille windows | macos | linux | unix ;
      - détection de session Linux x11 | wayland | unknown depuis l’environnement ;
      - disponibilité du binaire Rust et résultat de son probe ;
      - décision immuable par session : native ou electron-fallback, avec raison explicite.

  - Remplacer les appels directs à CaptureEngine dans l’IPC par un RecorderRouter présentant exactement les commandes existantes (discover, prepare, start, pause, resume,
    stop, status).
      - Le fallback est choisi uniquement avant prepare; aucune bascule en cours d’enregistrement.
      - En cas d’échec natif avant session, le routeur réessaie une fois avec Electron et enregistre la raison dans les diagnostics et les avertissements de session.

  - Créer electron/fallbackRecorder/ :
      - sources.cjs liste écrans/fenêtres via desktopCapturer, avec identifiant, libellé, miniature et icône.
      - recorder.cjs possède l’état de session, crée/finalise le manifeste, valide les chunks, gère pause/reprise par segments WebM et écrit la piste screen.
      - session-writer.cjs réutilise les règles de chemins, IDs, écritures atomiques, métriques et manifeste du contrat Rust v2.
      - frame-clock.cjs ancre les timestamps des frames Chromium sur l’horloge monotone Electron afin que les events de curseur X11 aient le même temps de session.
      - cursor.cjs orchestre uniquement les capacités réelles disponibles ; aucun mouvement, clic ou forme ne sera simulé.

  - Étendre les types/preload avec les seules méthodes nécessaires au fallback et conserver une API renderer bornée. Le renderer reçoit un flux de capture autorisé, encode
    avec MediaRecorder et écrit des chunks séquencés vers recorder.cjs; il n’accède jamais directement aux chemins ou au système.

  - Faire évoluer le lecteur de projet pour accepter les segments écran WebM du fallback, au lieu de rechercher seulement un MP4.

  ## Curseur Linux

  - Le fallback Electron déclare toujours embeddedCursor: true : la vidéo est l’unique rendu du curseur, évitant tout décalage ou doublon.
  - Sous X11 :
      - livrer un helper natif versionné, lancé et surveillé par cursor.cjs, lié à XFixes pour image/hotspot/forme et XInput2 pour les clics globaux ;
      - transmettre ses événements JSON Lines avec sessionNs, coordonnées pixels/normalisées, visibilité, clics et CursorKind, selon le format existant de cursor.json;
      - écrire telemetry.json avec le même schéma v2, utile aux zooms automatiques ;
      - marquer la piste { renderMode: "embedded-observer" } pour que l’éditeur exploite la télémétrie sans dessiner une seconde flèche.

  - Sous Wayland/XWayland sans capacités X11 utilisables :
      - ne pas écrire de sidecar curseur incomplet ;
      - signaler cursorObserver: unavailable et une limitation explicite dans le manifeste/diagnostic ;
      - conserver le curseur visible dans la vidéo.
    desktopCapturer peut aussi ne renvoyer qu’une source unique. Documentation Electron desktopCapturer (https://www.electronjs.org/docs/latest/api/desktop-capturer/)

  ## Diagnostics et HUD Preferences

  - Ajouter un IPC capture:diagnostics qui retourne un objet immutable comprenant :
      - version applicative depuis package.json/app.getVersion() ;
      - version du schéma de session et version du protocole cursor ;
      - backend actif et raison du fallback ;
      - OS exact (type, release, arch), session graphique Linux et hint Ozone ;
      - version Electron/Chromium/Node ;
      - GPU complet via les APIs Electron, état des features GPU et accélération matérielle ;
      - capacités de capture et limitations détectées.

  - Ajouter dans HudPreferences une carte “Recorder & diagnostics” avec icône Info :
      - Recorder: Native (Windows: …), Native (macOS: …) ou Electron fallback (Linux: PipeWire/X11) ;
      - Version: x.y.z ;
      - résumé OS/GPU visible et détails repliables ;
      - bouton secondaire avec icône Lucide Copy, copiant un rapport texte/JSON stable dans le presse-papiers.

  - La version éditable reste uniquement package.json.version; l’interface l’affiche mais ne permet pas de la modifier.

  ## Tests et critères d’acceptation

  - Tester chaque décision de platform.cjs, dont Linux, Unix, binaire absent, probe natif invalide et échec avant préparation.
  - Tester le routeur : contrat identique des commandes native/fallback, interdiction de bascule pendant une session et avertissement de fallback persistant.
  - Tester sources.cjs avec sources écran/fenêtre, miniatures, icônes manquantes et la réponse PipeWire à source unique.
  - Tester le writer fallback : création du manifeste v2, segments WebM, pause/reprise, ordre de chunks invalide, abandon, reprise et lecture par project-store.
  - Tester cursor.cjs avec helper X11 disponible, absent, arrêt inattendu, timestamps monotones, et garantir qu’aucun sidecar n’est produit sous Wayland non supporté.
  - Tester la carte HUD : chaque libellé backend, données diagnostics absentes, copie réussie/échouée, et version affichée.
  - Vérifier que le curseur intégré n’est jamais redessiné dans l’éditeur et que la télémétrie X11 reste exploitable par les zooms.
  - Exécuter Vitest, build TypeScript/Vite, et les tests Rust du contrat de manifeste ; documenter les tests X11/Wayland nécessitant une machine Linux réelle.

  ## Hypothèses retenues

  - Le fallback Electron Linux privilégie une capture visuellement correcte au faux “curseur séparé”.
  - Le helper X11 est livré avec l’application et devient la seule source de télémétrie séparée sous X11.
  - Wayland reste supporté pour la capture vidéo via Electron/PipeWire, mais sans promesse de forme ou clics globaux du curseur tant qu’un backend natif conforme n’est pas
    disponible.