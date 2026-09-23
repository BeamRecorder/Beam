# Plan : moteur natif unique pour ARGUI

Ce plan remplace le périmètre « intégration produit ultérieure » du G7 de `native-media-prototype.md` : l'écran rejoint la session commune et l'ancien moteur est supprimé après migration de ses capacités.

## Avancement de l’implémentation

Le parcours produit utilise maintenant `beam-media-engine`, appelable directement
comme bibliothèque Rust ou via son protocole JSON-lines versionné, sans ARGUI.
[API, contrat d’erreur et exemple à quatre sources](native-media-engine.md).

L’implémentation comprend :

- `beam-screen` : producteurs bruts natifs, sélection écran/fenêtre/région,
  captures fixes, curseur et interactions, files et aperçus bornés ;
- une session commune pour écran, caméra, microphone et audio système, avec
  deux vidéos WebM, deux WAV, pause/reprise segmentée et manifeste v2 ;
- le worker propriétaire, les commandes typées, les événements, les aperçus et
  les vumètres des streams déjà ouverts ;
- le branchement Electron, les lecteurs de projets anciens et des segments v2,
  les runtimes GStreamer privés et leurs workflows de construction par plateforme ;
- la suppression de `packages/capture`, de ses binaires et commandes, de la
  feature transitoire et des enregistreurs Chromium de Studio. La voix off
  indépendante de l’éditeur reste séparée.

Les validations automatisées Linux, le bundle Linux déplacé et les compilations
croisées macOS/Windows ont été exécutés. Les tests utilisent notamment quatre
writers réels avec des sources synthétiques, un Portal D-Bus isolé et un serveur
PipeWire isolé. Ils ne constituent pas les essais matériels demandés plus bas.

Restent à exécuter sur les machines cibles : les workflows de packaging/signature,
la lecture/export des quatre pistes avec les périphériques réels sur chaque OS,
les essais Linux Wayland/X11 et les sessions matérielles de 5 et 30 minutes.
Aucun gate matériel macOS/Windows, aucune mesure longue durée et aucune exécution
de CI distante ne sont déclarés réussis à partir de ce checkout Linux.

## Résultat exigé

ARGUI doit pouvoir sélectionner un écran, une fenêtre ou une région, une caméra, un microphone et une sortie audio système, puis enregistrer les quatre sources dans **une seule session**. L'écran et la caméra ont chacun leur piste vidéo ; le micro et l'audio système ont chacun leur piste audio. Un seul démarrage, une seule horloge, un seul manifeste et une seule commande d'arrêt gouvernent ces pistes indépendantes.

À la livraison, `capture` et son pipeline d'enregistrement historique, les sidecars `getUserMedia`/`MediaRecorder` de Studio, les commandes de capture héritées et leur branchement de distribution ont disparu. Aucun repli vers l'ancien moteur n'est conservé. Les anciennes sessions et les anciens projets restent **lisibles comme données** ; cette compatibilité ne relance aucun ancien code de capture.

Ce plan couvre Linux, macOS et Windows. Une compilation croisée n'est pas une validation de périphérique : la livraison exige les essais natifs indiqués plus bas.

## État de départ et décision d'architecture

- `beam-media-session` sait enregistrer caméra, micro et audio système, mais `SessionConfig` n'a pas d'écran et ne possède qu'un writer vidéo.
- `capture` sait sélectionner écran/fenêtre/région, capturer les frames, curseurs et interactions, et prendre des captures fixes. Ces fonctions doivent être déplacées avant la suppression de la crate.
- `capture-engine` contient actuellement deux contrôleurs de session exclusifs : l'enregistrement historique et `native-media`. Cette séparation disparaît.
- Le moteur final est une bibliothèque Rust `beam-media-engine` appelée directement par ARGUI. Elle possède le cycle de vie, la découverte, les permissions, les événements et les chemins de sortie. Une CLI de test très mince peut appeler cette même bibliothèque ; elle ne constitue pas un second moteur. ARGUI possède ses fenêtres et son `wgpu::Device`/`Queue`, tandis que Rust possède toujours toute la logique de capture, de synchronisation, d'encodage et de stockage.

Graphe cible :

```text
ARGUI -> beam-media-engine -> beam-media-session -> beam-screen
                                        |          -> beam-camera
                                        |          -> beam-audio
                                        |          -> beam-media-encode
                                        |          -> beam-media-manifest
                  beam-media-core <-----+
ARGUI -> beam-camera-wgpu (Device/Queue fournis par ARGUI)
```

Le helper Linux privilégié pour les événements d'entrée reste un processus auxiliaire dédié si nécessaire ; il quitte la crate `capture` et ne porte aucun état de session ou logique d'encodage.

## 1. Fixer le contrat public avant le branchement UI

Créer des types Rust versionnés et typés dans `beam-media-engine`, avec un équivalent sérialisable seulement là où une frontière de processus le demande :

- `RecordingConfig { output, screen, camera, microphone, system_audio, cursor, interactions }` ; chaque source peut être désactivée. `screen` distingue écran, fenêtre et sélection Portal Linux. Une région est un rectangle normalisé relatif à la source **effectivement choisie**, validé avant l'ouverture du writer.
- `RecordingController` expose `list_sources`, `capabilities`, `permissions`, `prepare`, `start`, `pause`, `resume`, `stop`, `cancel`, `status` et un flux d'événements typés. `prepare` retourne les sources résolues et les permissions refusées ; `stop` retourne le manifeste final et les pistes réellement disponibles.
- Le contrôleur expose des boîtes bornées « dernière frame » pour l'aperçu écran et caméra et des niveaux audio mesurés sans rouvrir les périphériques. ARGUI consomme ces données et charge les textures sur son propre `Device`/`Queue` ; aucune texture GPU ne franchit une frontière de processus.
- Les commandes de capture fixe et de prévisualisation de source utilisent les mêmes backends `beam-screen`, sans créer un second pipeline d'enregistrement.
- Les états `Idle`, `Preparing`, `Armed`, `Recording`, `Paused`, `Finalizing`, `Completed`, `Failed` et `Interrupted` ont des transitions et erreurs documentées. Les événements portent un identifiant de session, une piste, un horodatage et une cause ; une file pleine ne masque pas une erreur terminale.

**Gate :** tests de sérialisation/validation, transitions, annulation, demandes concurrentes et configuration contenant les quatre sources. Aucun type de protocole ne dépend de `capture`.

## 2. Déplacer l'écran et ses capacités hors de l'ancien moteur

Créer `beam-screen` en déplaçant, puis en adaptant, les backends existants : PipeWire + Portal et X11 sur Linux selon les routes réellement prises en charge, ScreenCaptureKit sur macOS et Windows Graphics Capture sur Windows. Préserver la découverte, les permissions, la sélection écran/fenêtre, les aperçus de source, la capture fixe, le crop, les changements de format, les erreurs de débranchement et les métadonnées de curseur.

Le contrat commun `ScreenSource` fournit format négocié, frames possédées, timestamps natifs si fiables, événements terminaux, profondeurs de file, `pause`/`resume` et `halt`. Adapter la sortie actuelle `ScreenSampleSink` à une file bornée que la session peut drainer ; ne garder aucun appel à FFmpeg dans la source. Les frames du crop sont validées puis recadrées avant l'encodeur et l'aperçu. Conserver les conversions coordonnées/échelle/DPI propres à chaque OS derrière l'adaptateur.

Sur Wayland, l'UI demande « écran » ou « fenêtre » et le Portal fait le choix effectif ; la région s'applique à la source retournée. Sur macOS et Windows, les identifiants viennent du catalogue natif. Une sélection annulée retourne un résultat d'annulation explicite, sans démarrer les autres sources ni laisser de fichier `.part` orphelin.

Déplacer aussi les événements de curseur et d'interactions vers `beam-screen` ou une petite crate `beam-input` si leur dépendance native le justifie. Déplacer la capture fixe PNG vers `beam-screen` ; les fonctions de screenshot utilisées par Beam ne doivent pas disparaître avec `capture`.

**Gate :** tests de crop/bords/DPI, Portal annulé, permission refusée, changement de format, perte de source, arrêt bloqué et pression sur la file ; captures fixes et aperçus maintenus sur les trois OS. Aucune dépendance de `beam-screen` vers `capture`.

## 3. Étendre la session à deux vidéos et deux audios

Ajouter `screen` à `SessionConfig`, à la factory de sources et au `MediaSession`. Ouvrir un writer GStreamer indépendant pour `screen.webm` et conserver celui de `camera.webm`, puis les deux WAV distincts. Le manifeste v2 contient une piste `Screen`, déjà prévue par `TrackKind`, et les trois autres pistes. Une source absente, refusée ou interrompue échoue sur sa piste sans fabriquer des données pour les autres.

Le `StartGate` commun libère les quatre sources à la même origine temporelle. `poll` draine les quatre files avec une limite de travail par appel pour qu'une piste ne bloque pas les autres. Pause et reprise créent des segments cohérents sur toutes les pistes actives ; l'arrêt ferme les producteurs, draine les paquets, envoie EOS à chaque writer, publie le manifeste et les mesures, et conserve les `.part` récupérables en cas d'erreur.

Le curseur, les clics et les raccourcis sont horodatés sur cette même timeline et attachés à la piste écran. La capture fixe reste une opération séparée qui réutilise le backend écran, sans se faire passer pour une session vidéo.

**Gate :** session synthétique déterministe à quatre pistes, deux vidéos et deux WAV lisibles indépendamment ; PTS monotones, première frame et premier échantillon alignés sur le start gate, pause/reprise, file saturée, piste manquante, erreur d'encodeur, disque plein et arrêt forcé. Test matériel Linux à quatre sources avant de brancher ARGUI.

## 4. Construire l'unique moteur appelable par ARGUI

Faire de `beam-media-engine` le propriétaire exclusif d'une `MediaSession` active. Il assure le polling sur un worker dédié, les réponses de commande, l'abonnement aux événements, l'arrêt à la fermeture et la validation des répertoires de projet. ARGUI lui passe des intentions et reçoit des états typés ; il ne pilote ni PipeWire, ni ScreenCaptureKit, ni Media Foundation, ni GStreamer.

Le branchement ARGUI suit cet ordre :

```text
list_sources/capabilities -> choix écran + région + caméra + micro + sortie
prepare(config)           -> résolution Portal/permissions + état Armed
start(session_id)         -> même start gate pour les quatre pistes
status/events/previews    -> UI d'enregistrement et indicateurs de panne
pause/resume facultatifs -> segments sur la timeline commune
stop(session_id)          -> manifeste final + chemins des quatre pistes
```

ARGUI dessine l'overlay de région, convertit le rectangle depuis les coordonnées de la source sélectionnée vers `[0,1]`, puis envoie cette valeur typée. Il ne choisit pas un chemin de sortie arbitraire dans une vue : le contrôleur de projets fournit un répertoire de session validé. L'aperçu vidéo lit la boîte « dernière frame » sans ralentir le writer ; les vumètres lisent les mesures des streams déjà ouverts.

**Gate :** un petit client ARGUI ou banc d'intégration exécute ce cycle avec les quatre sélections, les refus/annulations et un redémarrage après erreur ; une seule instance du moteur et aucun appel aux anciennes commandes.

## 5. Migrer projets, éditeur et distribution

Adapter la bibliothèque de projets et l'éditeur aux pistes et segments du manifeste v2 : écran et caméra sont des médias distincts, les deux WAV gardent leurs identités, les pistes absentes/échouées restent visibles comme telles, et les anciens projets/sessions s'ouvrent sans réenregistrement. Migrer les chemins de curseur et d'interactions. Ne pas déduire une piste d'un nom de fichier quand le manifeste est présent.

Construire et distribuer **le nouveau moteur uniquement** avec le runtime GStreamer privé et son allowlist sur Linux, macOS et Windows. Inclure les notices/licences et les descriptions de confidentialité dans le véritable hôte macOS ARGUI, pas seulement dans le probe. Vérifier le bundle déplacé sur un système sans GStreamer préinstallé. Si macOS 13 reste officiellement pris en charge, décider et implémenter une solution d'audio système compatible avant de supprimer l'ancien chemin : le tap actuel du prototype exige macOS 14.2+.

**Gate :** les quatre pistes sont éditables/exportables, les anciens projets restent lisibles, le paquet installé ne requiert pas de SDK GStreamer du système et ne charge aucun binaire de l'ancien moteur.

## 6. Supprimer l'ancien moteur sans repli

Après passage des gates précédents, supprimer `packages/capture`, son binaire `capture-engine`, `capture-probe`/`capture-smoke` hérités, ses modules de session, de FFmpeg et de PipeWire audio en double, ainsi que les commandes JSON-lines et IPC historiques. Déplacer le helper Linux et les fonctions screenshot encore utiles avant cette suppression. Retirer les sidecars Chromium Studio `getUserMedia`/`MediaRecorder`, leur stockage différé et les options d'UI qui les invoquent ; les usages indépendants, comme une éventuelle voix off d'éditeur, sont évalués séparément et migrés s'ils doivent aussi être natifs.

Mettre à jour Cargo, les scripts de développement, `package.json`, les workflows CI/release, les artefacts signés et vérifiés, les tests et `docs/ARCHITECTURE.md`. Supprimer la feature transitoire `native-media` : la session native unique devient le seul chemin. Conserver uniquement les lecteurs et migrations de **données** anciennes dans `beam-media-manifest`/le modèle de projet.

**Gate de suppression :** aucune référence de build ou de runtime à la crate/binaire `capture`, aux commandes historiques, aux sidecars Studio ou à un encodeur FFmpeg d'enregistrement ; un inventaire des fichiers supprimés est revu. Les packages Linux/macOS/Windows démarrent le nouveau moteur, et un projet ancien s'ouvre sans lancer l'ancien code.

## 7. Vérification finale avant déclaration « terminé »

- Rust 1.92 : formatage, Clippy `--all-targets --all-features`, Nextest, layout `test/`, moins de 500 lignes par source et couverture source d'au moins 85 % pour le workspace **et chaque crate**. Les tests vérifient également les chemins d'échec.
- Builds et tests sur runners Linux, macOS x86_64/ARM64 et Windows x86_64/ARM64 ; compilation croisée depuis Linux en contrôle intermédiaire seulement.
- Sur chaque OS : écran entier, fenêtre, région, caméra, micro et sortie système dans une même session ; permissions, annulation, changement de sortie, déconnexion, pause/reprise, arrêt et lecture des quatre fichiers. Linux vérifie Wayland et X11 ; au moins une caméra USB et les sorties audio pertinentes sont essayées.
- Sessions de 5 puis 30 minutes : aucune croissance mémoire non bornée, drops et profondeur des files mesurés, durée/PTS cohérents, preview indépendant de l'encodage, manifeste récupérable après panne. Comparaison sur le même matériel avec l'actuel Beam avant sa suppression.
- Changelog utilisateur mis à jour lors de l'activation du nouveau parcours. Aucun gate matériel macOS/Windows n'est déclaré passé depuis Linux.

L'ordre est important : **contrat -> extraction des capacités écran -> session à quatre pistes -> façade ARGUI -> projets/bundle -> suppression**. Le dernier gate vérifie l'absence de l'ancien moteur ; la compatibilité des fichiers historiques reste une responsabilité du nouveau lecteur.
