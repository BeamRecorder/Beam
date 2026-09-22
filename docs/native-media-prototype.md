# Beam : plan du prototype média entièrement natif

Statut au 22 septembre 2026 : les neuf crates, la CLI, la session partagée, les writers GStreamer et les adaptateurs caméra/audio Linux, macOS et Windows existent derrière la même API. `AudioSource` et `CameraSource` formalisent désormais le contrat commun de la session. La sortie macOS duplex utilise un tap Core Audio privé de Beam ; Linux découvre et cible les sorties PipeWire individuelles. L'ancien moteur `capture` réexporte le manifeste v2 extrait. Avec la feature `native-media`, `capture-engine` expose la découverte et le cycle de vie natifs au travers de son protocole JSON-lines, avec un worker qui continue de drainer les sources pendant les lectures bloquantes du protocole ; Electron relaie ces commandes via une API typée et attribue lui-même le répertoire de sortie. Le build distribué garde cette feature désactivée tant que GStreamer privé et l'intégration produit ne sont pas prêts. Les sidecars Chromium du Studio et son éditeur ne sont pas encore migrés. Les fichiers source Rust du workspace possèdent leur miroir sous `test/` ; les 12 suites d'intégration historiques ont été migrées.

Les 1084 tests Nextest non ignorés du workspace passent sous Linux ; sept tests dépendant du matériel ou d'un serveur PipeWire restent ignorés dans cette commande et les essais locaux pertinents ont été exécutés séparément. Après fermeture des producteurs, drainage des files et bornage de l'attente EOS, un essai Linux optimisé de cinq secondes a finalisé trois pistes lisibles : 62 images caméra encodées et affichées, 241152 échantillons micro, 240640 échantillons système, zéro drop et un pic RSS observé de 105594880 octets. Les durées lues par `ffprobe` sont 4,913336 s pour la caméra, 5,024 s pour le micro et 5,013333 s pour le système. Un essai séparé avec `--system-output` sur la sortie haut-parleur PipeWire a finalisé un WAV de 2,026667 s avec 97280 échantillons sans perte. Après l'introduction des interfaces de source, un nouvel essai Linux optimisé de trois secondes a finalisé les trois pistes (durées 2,993355 s, 3,029333 s et 3,029333 s). Après les corrections d'arrêt des workers, un autre essai de trois secondes a finalisé 38 images caméra et deux WAV de 3,029333 s. Le rapport ne donne pas d'offset A/V sans signal de référence ; la nouvelle sonde demande la mémoire allouée à wgpu quand le backend sait la fournir.

Un essai Linux de cinq secondes a ensuite envoyé une tonalité de 440 Hz vers une sortie PipeWire virtuelle, sans jouer sur les haut-parleurs, pendant une session micro + système. Les deux pistes ont fini en état `Completed` avec zéro drop : 240128 échantillons micro silencieux et 240640 échantillons système contenant la tonalité (pic PCM 0,125 ; RMS 0,0684). Leurs empreintes SHA-256 diffèrent. Cela prouve la séparation et le ciblage de cette sortie virtuelle, pas la qualité d'une prise micro audible ni les cas matériels des autres OS.

Le formatage et Clippy Rust 1.92 avec `--all-targets --all-features` passent sous Linux et en compilation croisée de tout le workspace pour macOS x86_64/ARM64 et Windows MSVC x86_64/ARM64 (`DOCS_RS=1` en cross pour éviter le lien au SDK GStreamer absent ici). Le remplacement de Nokhwa a supprimé l'ancien blocage `objc_exception` de la compilation croisée macOS. Le workflow `native-media.yml` installe GStreamer 1.28.7 et exécute compilation, Clippy et Nextest sur les trois OS, mais il n'a pas encore été exécuté sur GitHub. La dernière mesure LLVM Linux des 1084 tests sans matériel couvre 11436/14352 lignes source du workspace (79,68 %). `beam-audio` est à 1006/1271 (79,15 %) et `capture` à 7498/9824 (76,32 %) ; les sept autres crates dépassent chacune 85 %. Un profil brut LLVM corrompu a encore été signalé et ignoré pendant cette collecte. Le gate strict de 85 % par crate et workspace reste ouvert ; les plus grands manques portent sur les callbacks PipeWire/DBus et les chemins d'entrée matériels non injectables.

Une mesure ciblée plus récente de `beam-media-probe` sous Linux, avec le test du worker wgpu désormais inclus, la finalisation sur durée impossible et les sources audio/caméra inexistantes, couvre 507 lignes sur 594 (85,35 %) avec 22 tests passants. Elle fait passer cette crate au-dessus de son seuil individuel pour ce scénario de mesure ; la couverture globale du workspace et des autres crates reste ouverte.

La couverture combinée de `beam-media-session` atteint ensuite 800 lignes sur 935 (85,56 %) : 34 tests de la crate, 22 tests du probe et un enregistrement local réel des trois pistes. Les chemins des adaptateurs partagés sont ainsi inclus dans cette mesure Linux. Un premier essai instrumenté demandé pour quatre secondes a pris 7,42 s et perdu des échantillons, alors qu'un second a duré 4,026 s, sans drop, avec des fichiers de 3,953 s (vidéo), 4,021 s (micro) et 4,032 s (système) lisibles par `ffprobe`. La couverture n'est pas une mesure de performance ; les essais optimisés et ceux sur les autres OS restent nécessaires.

Le rapport expose maintenant le nombre d'appels à `poll()`, leur durée maximale, et la durée maximale de l'échantillonnage RSS/CPU. Un nouvel essai Linux optimisé de quatre secondes termine les trois pistes sans drop ; 375 appels à `poll()` culminent à 1,26 ms, quatre échantillons de ressources culminent à 59,5 ms, et les 50 images acquises sont encodées et affichées. Un essai identique sous instrumentation LLVM termine aussi sans drop, mais `poll()` atteint 947 ms (32 appels sur quatre secondes), tandis que l'échantillonnage culmine à 134 ms. L'écart vient donc principalement du chemin de session instrumenté sur cet essai ; la cause exacte du premier essai long reste à confirmer et aucun seuil de performance n'est déduit des exécutions avec couverture.

Après l'ajout des compteurs et des tests de compatibilité, les 59 tests ciblés de `beam-media-session` et `beam-media-probe` passent sous Linux. La collecte LLVM combinant ces tests et les essais matériels locaux donne 825/957 lignes (86,21 %) pour la session et 553/606 (91,25 %) pour le probe. Ces pourcentages ciblés ne ferment pas le seuil de 85 % de tout le workspace ni les essais natifs des autres OS.

Les essais physiques macOS/Windows, une session Linux X11 native, la validation des bundles privés GStreamer sur leurs runners et les obligations de licence, la couverture stricte et l'intégration produit restent à valider. Aucun gate matériel sur les autres OS n'est déduit de la compilation croisée.

Un essai long préparatoire a révélé que l'entrée virtuelle ALSA `alsa:null` rendait 579 secondes d'échantillons micro en environ 13 secondes réelles. Cette entrée n'est pas cadencée par le matériel et ne convient pas au gate de durée. La capture CPAL commune aux trois OS rejette désormais une source dont la fin des échantillons dépasse de plus de deux secondes l'horloge de session. Les erreurs terminales des sources CPAL, caméra et PipeWire Linux passent par une file prioritaire distincte pour conserver leur statut même lorsque les notifications de drops saturent leur file. Un essai de trois secondes avec `alsa:null` a produit un WAV borné à 0,93 s, un manifeste `Failed` et un code retour non nul ; `alsa:default` a enregistré 2,965 s avec `Completed`.

Un premier essai physique de 30 minutes a finalisé les trois pistes (caméra 1799,993 s, micro 1787,104 s, système 1799,723 s), mais l'aperçu a épuisé la mémoire GPU vers la 26e minute et la CLI a échoué. La cause était l'absence de `queue.submit` après `write_texture`, qui laissait s'accumuler les allocations de transfert. L'aperçu soumet et poll désormais chaque frame, et transmet un éventuel échec GPU avec les compteurs déjà acquis. Un nouvel essai optimisé de cinq secondes a terminé avec 62 frames d'aperçu, une seule texture recréée, zéro drop et aucune erreur GPU. Un autre essai long a été arrêté proprement après ses premières minutes sans drop pour ajouter l'échantillonnage mémoire GPU au binaire. L'essai physique final de 30 minutes avec le micro matériel, la caméra et une sortie PipeWire virtuelle a terminé avec trois pistes `Completed`, zéro drop et aucun échec de l'aperçu. `ffprobe` lit 1799,994 s pour la caméra, 1799,936 s pour le micro et 1800,021 s pour le système. Les 22495 images acquises sont toutes encodées et chargées dans l'aperçu, avec une seule création de texture ; la latence moyenne de soumission est 4,596 ms, le maximum 24,761 ms. Le pic RSS de l'arbre de processus est 116269056 octets ; les allocations wgpu rapportées restent à 2990536 octets sur les dix dernières minutes, avec un pic de 2990784 octets. La tonalité 440 Hz atteint 0,125 sur le WAV système ; les cinq premières secondes du WAV micro sont silencieuses. La dérive mesurée du micro est 41,67 ppm ; l'audio système et l'offset A/V restent non mesurés faute de timestamp natif et de signal de référence respectivement.

Le backend PipeWire audio demande maintenant une métadonnée de buffer `Header` et ne transmet son PTS au contrat audio commun que s’il est valide et monotone. Une discontinuité invalide les ancres natives suivantes. Un essai local de cinq secondes avec uniquement l’audio système a terminé en `Completed`, mais le moniteur PipeWire n’a fourni aucun PTS : la dérive système reste donc non mesurée sur cette route. L’horloge de graphe PipeWire n’est pas substituée au PTS du buffer. Les tests audio ciblés passent sous Linux ; la compilation croisée Clippy des crates audio, caméra, session et probe passe sur macOS x86_64/ARM64 et Windows MSVC x86_64/ARM64. Les backends macOS/Windows restent à exécuter sur leurs OS respectifs.

Le calcul de dérive commun conserve maintenant le premier timestamp natif disponible même si la piste a commencé sans lui. Une perte ultérieure de timestamps ou une discontinuité signalée par la caméra ou l’audio invalide la dérive de cette piste uniquement ; les points bruts restent sauvegardés et les anciens fichiers de mesures gardent une valeur par défaut compatible. Les tests ciblés des crates audio, session et probe passent sous Linux, ainsi que Clippy avec toutes les features sur les quatre cibles macOS/Windows.

La timeline audio CPAL commune aux trois OS détecte aussi les reculs et grands sauts de son horloge de capture. Elle continue à enregistrer les échantillons mais invalide les ancres natives de dérive suivantes. Les 115 tests ciblés audio/session/probe passent après cette correction ; les essais matériels Mac/Windows restent ouverts.

Un essai optimisé de cinq secondes micro + système après cette détection a terminé les deux WAV en `Completed`, sans drop ni discontinuité signalée : 240128 échantillons micro, 240640 échantillons système. La pente micro calculée sur les ancres natives de cet essai vaut 77,15 ppm ; celle du système reste inconnue car le moniteur PipeWire n’a livré aucun PTS.

Un essai Linux de débranchement de sortie virtuelle a confirmé le contrôle de la route explicitement choisie : suppression du sink après deux secondes, piste système `Interrupted`, raison du débranchement dans le manifeste, WAV finalisé et code retour non nul. Le choix de sortie par défaut reste libre de suivre le défaut du système.

Le backend caméra Windows utilise un Source Reader Media Foundation asynchrone direct : une seule lecture en vol, callback vers une file bornée, `Flush` à l'arrêt et `IMFMediaSource::Shutdown` explicite. Le backend caméra macOS utilise désormais directement `AVCaptureVideoDataOutput`, son option de [rejet des images tardives](https://developer.apple.com/documentation/avfoundation/avcapturevideodataoutput/alwaysdiscardslatevideoframes), un callback à file bornée et une copie BGRA de taille vérifiée avant de rendre le buffer au système. Les deux backends échouent explicitement après dix secondes sans image/callback. Les quatre compilations croisées macOS/Windows du workspace passent et les contrats publics `CameraSource` et `CameraFrame` restent communs. Les tests des runners macOS/Windows et les appareils réels restent à exécuter ; G3/G6 restent ouverts.

Le branchement du protocole `capture-engine` avec la feature `native-media` a enregistré localement sous Linux trois secondes de caméra, micro et audio système. Les trois pistes sont `Completed` avec zéro drop : 37 images caméra acquises et encodées, 143872 échantillons micro et 143360 échantillons système. `ffprobe` lit leurs durées de 2,913367 s, 2,997333 s et 2,986667 s. Le moteur a répondu aux commandes de découverte, préparation, démarrage, état et arrêt, puis a quitté sans erreur. Ses nouvelles commandes compilent avec toutes les features sous Rust 1.92 pour macOS ARM64/x64 et Windows ARM64/x64 ; ces vérifications Linux ne lient ni n'exécutent les binaires sur ces OS.

Le contrôle d'allowlist `scripts/ci/check_gstreamer_profile.py` isole les plugins GStreamer et relance les huit tests des writers. Deux de ces tests isolent un `appsrc` manquant et forcent une erreur d'écriture avec `RLIMIT_FSIZE` sous Linux ; le writer échoue sans publier de fichier final. Il a révélé que `filesink` exige `coreelements`, omis de l'inventaire initial ; le profil corrigé de sept plugins passe sous Linux. Un inventaire JSON des sept plugins Linux, avec empreintes SHA-256, a aussi été généré. Le workflow prévoit ce même contrôle et un inventaire archivé sur macOS et Windows, mais cette exécution reste à faire sur leurs runners.

Un assembleur de bundle privé Fedora 44 copie désormais le probe, ces sept plugins, le scanner GStreamer, les bibliothèques ELF requises hors dépendances système déclarées, les notices RPM installées et un inventaire de leurs empreintes. Un lancement déplacé du bundle a enregistré trois pistes lisibles sur le matériel Linux. Dans un conteneur Fedora 44 sans paquets GStreamer, après installation des seules bibliothèques système PipeWire/ALSA/DRM, les sept factories privées et le probe se chargent. Le workflow natif construit maintenant ce bundle sur Fedora 44 et le reteste dans un second conteneur propre ; la commande de contrôle a passé localement, mais pas encore sur un runner GitHub. Des assembleurs macOS et Windows sont écrits et branchés dans ce workflow ; ils sélectionnent les mêmes sept plugins et vérifient leurs bibliothèques liées. Des seconds jobs macOS et Windows doivent aussi retester les artefacts téléchargés sur des runners frais sans installer GStreamer. Ces jobs n'ont pas encore été exécutés. Il reste à vérifier l'enregistrement sur une machine propre avec périphériques, les autres distributions Linux et les bundles macOS/Windows ; G6 reste ouvert.

Le probe accepte `--preview-delay-ms 0..1000` pour ralentir uniquement son worker wgpu. Sur la caméra intégrée et deux essais Linux de huit secondes, l'aperçu normal a chargé 100 images et la piste en a acquis/encodé 100 ; avec 500 ms de délai par aperçu, 16 images ont été affichées et 101 images ont été acquises/encodées, sans perte dans les deux cas. Les deux WebM sont lisibles (7,953 s et 8,033 s). La mesure de capacité des buffers CPU réutilisés compte leurs réallocations et leur croissance. Après cet ajout, deux essais de cinq secondes confirment 63/63 images acquises/encodées et affichées sans délai, contre 64/64 acquises/encodées et dix affichées avec 500 ms de délai. Chaque aperçu n'a eu qu'une croissance initiale de 1 228 800 octets, sans autre réallocation. Le probe compte maintenant aussi les octets écrits pendant la conversion couleur CPU, les copies de padding de ligne CPU et les octets transférés au GPU, puis publie ces totaux par image d'aperçu chargée. Les tests unitaires et un essai local du worker wgpu valident les compteurs. Un essai Linux optimisé de cinq secondes a ensuite produit trois pistes `Completed`, avec 63 images caméra acquises/encodées et chargées dans l'aperçu, zéro drop et des durées lisibles de 4,993369 s, 5,013333 s et 5,013333 s. Le rapport mesure 1 228 800 octets de conversion CPU et d'upload GPU par image, aucune copie supplémentaire de padding pour cette largeur alignée, une croissance initiale de buffer CPU de 1 228 800 octets et un pic de 2 990 784 octets alloués selon wgpu. Il reste à relever les valeurs sur les autres OS et à les comparer au moteur actuel. Ces mesures sont propres à cette caméra et à ce GPU ; elles prouvent l'indépendance de la file d'enregistrement pour ce cas, sans fixer un seuil universel de performance.

Les échantillons périodiques RSS/CPU/GPU incluent maintenant le nombre cumulé d'images d'aperçu chargées. Un essai Linux optimisé de quatre secondes a terminé les trois pistes et 50 images d'aperçu ; les quatre échantillons publiés portent successivement 7, 20, 32 et 45 images, avec RSS et CPU associés. `ffprobe` lit 4,033257 s de vidéo et 4,032 s pour chacun des deux WAV. Cette série permet de comparer cadence et ressources au cours du temps, mais n'est pas encore une comparaison au Beam Electron actuel ni une mesure sur macOS/Windows.

L'arrêt de session borne désormais le drainage après `halt` : si une source annonce toujours des paquets qu'aucune lecture ne rend, sa piste devient `Interrupted` plutôt que de bloquer la finalisation. Un test injecte cette panne sur le micro et vérifie que le WAV système indépendant reste finalisé en `Completed`. Le gate G5 exige encore les essais de permissions, changement de sortie et référence A/V sur les autres machines.

L'API caméra distingue maintenant `PermissionDenied` de `DeviceUnavailable` sur les trois adaptateurs : autorisation AVFoundation refusée, erreur d'accès V4L2 et `E_ACCESSDENIED` de Media Foundation. Un test de session force aussi l'échec de publication du WAV micro après encodage ; le manifeste marque cette piste `Failed`, conserve son `.part`, et finalise la vidéo et le WAV système. Ces tests vérifient la classification et l'isolation, pas les dialogues de permission physiques des autres OS ni une saturation réelle du disque.

Un test de panne de publication de `measurements.json` a révélé que `MediaSession::stop` quittait sans manifeste final après avoir achevé les médias. L'arrêt tente désormais de publier un manifeste final incomplet avec l'erreur dans `warnings`, conserve les segments achevés et renvoie l'erreur de stockage. L'écriture atomique supprime son fichier temporaire si le renommage final échoue. Un second test bloque la publication du manifeste final et confirme que le checkpoint partiel, les mesures et le WAV finalisé restent présents. Ces tests bloquent les chemins de destination plutôt que de saturer réellement le disque ; ils ne prouvent pas l'écriture d'un manifeste final quand le disque n'a plus d'espace.

Des tests de session et de CLI remplacent `manifest.partial.json` par un répertoire après le démarrage : le checkpoint périodique échoue, puis `interrupt` publie quand même un manifeste final incomplet avec la cause en avertissement et conserve les mesures. La finalisation ne tente de supprimer le checkpoint que s'il s'agit d'un fichier. Le rapport LLVM frais du workspace, avant l'ajout de ces tests, a exécuté 562 tests sans appareil (7 ignorés) et atteint 8112/13285 lignes, soit 61,06 %. Après les cinq tests matériels Linux ignorés et une session instrumentée à trois pistes de quatre secondes sans drop, la couverture combinée atteint 66,26 % du workspace ; `beam-audio` est à 85,89 %, `beam-camera` à 82,97 %, `beam-media-session` à 83,32 % et `capture` à 57,26 %. Un profil brut corrompu issu de la suite complète a été isolé avant la fusion LLVM ; les chiffres combinés ne doivent pas être pris pour le gate strict CI, qui reste ouvert.

La revue des adaptateurs macOS et Windows conserve leur implémentation native derrière `CameraSource` et `AudioSource`. La copie BGRA de la caméra AVFoundation vérifie désormais la taille réelle du buffer Core Video avant la lecture, et le callback Media Foundation garde la première erreur remontée par ses callbacks même si une autre erreur survient ensuite. La CLI macOS embarque maintenant son propre `Info.plist` dans `__TEXT,__info_plist` avec les descriptions caméra, micro et audio système requises avant la demande de permission ; le vérificateur du bundle relit ces clés dans le binaire relocalisé. Les quatre cibles macOS/Windows compilent avec tous les features, mais le lien natif, la lecture du Mach-O final et les essais sur périphériques attendent leurs runners et machines respectifs.

Un essai Linux a envoyé SIGINT au probe après trois secondes de capture réelle. La session a quitté avec un code non nul, trois pistes `Interrupted` et trois fichiers finalisés lisibles par `ffprobe` (caméra 2,273 s, micro et système 2,368 s). Un essai séparé avec une caméra explicitement inexistante a conservé la piste caméra en `Failed` et finalisé les deux WAV audio en `Completed` (2,997 s et 2,987 s). Ces essais confirment l'arrêt forcé et l'isolation d'une source manquante sur ce matériel.

## 1. Résultat attendu et limites du premier goal

Un programme Rust sans UI démarre une webcam, un micro et l'audio système, enregistre trois pistes séparées, publie chaque nouvelle image caméra sur une texture utilisable par un `wgpu::Device` et une `wgpu::Queue` fournis par l'appelant, puis écrit un manifeste horodaté. Il doit terminer proprement si une source est débranchée, qu'une permission est refusée, que l'encodeur manque ou que le disque échoue. La même API doit être exercée sur Linux, macOS et Windows avant de remplacer les sidecars Chromium ou de reprendre la capture d'écran.

La cible est une timeline commune *mesurable*. Plusieurs périphériques ont des horloges physiques qui dérivent ; aucune `SessionClock` ne peut garantir à elle seule « jamais de décalage ». Le prototype conserve les positions d'échantillons, les timestamps natifs et leurs ancres, mesure les écarts, et laisse une correction explicite au muxage/export quand elle est nécessaire.

Hors du premier goal : ARGUI, refonte de l'écran, export final du Studio, effets webcam, accélération GPU universelle et remplacement d'Electron. X11 ne modifie pas le choix micro/caméra sous Linux ; il deviendra pertinent pour la fenêtre et la capture d'écran. Le test Linux doit couvrir X11 et Wayland lorsque les deux sessions sont disponibles.

## 2. Constat dans Beam et dans les sources étudiées

- Beam possède déjà `packages/capture`, une horloge/start gate, un modèle de pistes et un manifeste v2. Son audio système Linux utilise PipeWire ; webcam et micro passent encore par Chromium. Les chemins écran macOS/Windows encodent actuellement dans leurs backends. Le prototype natif doit donc s'intégrer au schéma existant sans le dupliquer.
- [Cap sépare sa caméra en façade et modules Linux/macOS/Windows](https://github.com/CapSoftware/Cap/blob/main/crates/camera/src/lib.rs), emploie des formats/timestamps natifs et [rattache des horloges audio à la timeline](https://github.com/CapSoftware/Cap/blob/main/crates/timestamp/src/lib.rs). Son [aperçu macOS importe des plans IOSurface/Metal dans wgpu](https://github.com/CapSoftware/Cap/blob/main/apps/desktop/src-tauri/src/camera_native.rs). Nous reprenons ces *idées*, sans crate, fork, code ou binaire Cap. Cap utilise par ailleurs des forks de CPAL et FFmpeg : aucune dépendance de ce type n'entre dans Beam.
- [Nokhwa 0.10.11 `frame_texture`](https://github.com/l1npengtul/nokhwa/blob/0.10.11/nokhwa-core/src/traits.rs#L164-L214) décode en RGBA sur CPU puis crée une texture à chaque frame. Cela peut servir de comparaison, pas de contrat principal pour l'aperçu à allocations bornées.
- [CPAL 0.18.2](https://github.com/RustAudio/cpal) offre micro sur les trois OS et loopback de sortie sur [Windows](https://github.com/RustAudio/cpal/blob/v0.18.2/src/host/wasapi/mod.rs#L18-L22). Il possède aussi un [chemin loopback macOS à base de Core Audio taps](https://github.com/RustAudio/cpal/blob/v0.18.2/src/host/coreaudio/macos/loopback.rs). Ce dernier doit être testé sur de vrais périphériques, notamment ceux qui annoncent entrée et sortie ; [son choix de voie dépend de `supports_input()`](https://github.com/RustAudio/cpal/blob/v0.18.2/src/host/coreaudio/macos/device.rs). Un tap Core Audio Beam direct serait la solution de remplacement locale si les mesures échouent. Apple exige macOS 14.2+ et `NSAudioCaptureUsageDescription` pour [les taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps).
- Côté caméra, le premier chemin ciblé est [V4L2 mmap](https://cdn.kernel.org/doc/html/latest/userspace-api/media/v4l/mmap.html), [AVCaptureVideoDataOutput](https://developer.apple.com/documentation/avfoundation/avcapturevideodataoutput) et [Media Foundation Source Reader](https://learn.microsoft.com/en-us/windows/win32/medfound/processing-media-data-with-the-source-reader). La conservation trop longue d'un buffer caméra macOS peut bloquer le pool natif : les files doivent être petites et la propriété du buffer explicite.

## 3. Décision GStreamer et licences

**GStreamer est le choix principal, avec `gstreamer-rs`, pour l'encodage et le muxage.** La capture reste dans les crates natives : elle peut alimenter à la fois l'encodeur et wgpu sans dépendre d'un plugin de découverte/capture propre à chaque OS. Les `appsrc` reçoivent des buffers avec PTS et durée calculés depuis la session ; [l'horodatage à l'arrivée dans `appsrc` ne remplace pas le temps de capture](https://gstreamer.freedesktop.org/documentation/application-development/advanced/pipeline-manipulation.html).

Premier format mesurable et simple à distribuer : caméra `VP8/WebM` (`videoconvert ! vp8enc ! webmmux`), micro et système `PCM/WAV` (`audioconvert ! wavenc`). Trois fichiers restent séparés, avec leurs ancres dans le manifeste. WAV facilite la mesure des échantillons sans délai de codec audio ; Opus est candidat après le gate de synchronisation. Ce profil n'est pas le choix de codec final du produit. [GStreamer documente `vp8enc` + `webmmux`](https://gstreamer.freedesktop.org/documentation/vpx/vp8enc.html) ; les plugins `appsrc`, `vp8enc`, `webmmux` et `wavenc` sont présents dans le runtime Fedora observé ici, mais doivent être vérifiés dans les bundles macOS/Windows.

Le bundle privé dynamique est accepté : bibliothèques, seuls plugins autorisés, dépendances natives, registre/plugin scanner si requis, licences, notices et sources correspondantes. [GStreamer décrit ce mode de déploiement](https://gstreamer.freedesktop.org/documentation/deploying/index.html). Les bindings Rust sont MIT/Apache ; le runtime est LGPL et les licences effectives des plugins doivent être contrôlées (`gst-inspect-1.0`). Exclure `gst-libav`, `x264enc` et les ensembles « GPL/nonfree » du bundle initial. GStreamer ne fait pas disparaître les obligations d'un codec ou d'un plugin. [FFmpeg est LGPL dans sa configuration de base, avec des options qui changent le régime de licence](https://www.ffmpeg.org/legal.html) : son usage dans le nouveau pipeline reste un recours uniquement après un échec matériel ou de packaging documenté de GStreamer. Cela ne supprime pas l'usage FFmpeg de l'enregistreur écran actuel pendant la transition.

Les licences du logiciel et la vente sont deux décisions distinctes. [Beam est MIT](../LICENSE) ; [Cap est majoritairement AGPLv3, avec certaines familles caméra MIT](https://github.com/CapSoftware/Cap#license). La commercialisation future ne demande aucun code Cap. Un changement éventuel de licence Beam est une décision produit séparée, à traiter avec les droits des contributeurs.

## 4. Graphe des crates et contrats

```text
beam-media-core ───────────────┬──> beam-audio ─────────┐
                               ├──> beam-camera ────────┤
                               └──> beam-media-encode ──┤
beam-media-manifest ────────────────────────────────────┤
beam-camera ──> beam-camera-wgpu                         ├──> beam-media-session
                                                        │            │
beam-camera-wgpu + beam-media-session ───────────────────┘            └──> beam-media-probe

capture existant ──> beam-media-core, beam-media-manifest ; après les gates,
                    capture ──> beam-media-session et les nouveaux backends.
```

| Crate | API publique visée | Ce qu'elle possède | Ce qu'elle ne possède pas |
| --- | --- | --- | --- |
| `beam-media-core` **existe** | `SessionClock`, `NativeTimestampMapper`, `AudioSampleClock`, `VideoFrame<T>`, `AudioPacket<T>`, aperçu dernière frame | Temps et contrats sans I/O | OS, GStreamer, wgpu |
| `beam-media-manifest` | Modèles v2, `ManifestWriter`, écriture atomique, lecture/validation | Schéma de session et fichiers de métadonnées | Capture/encodeur |
| `beam-audio` | `list_inputs`, `open_microphone`, `open_system_audio`, `stop`, événements d'état | Flux PCM horodatés, autorisations et métriques | Écriture disque, GStreamer |
| `beam-camera` | `list_cameras`, `formats`, `open`, `stop`, frames natives | Périphérique, format et durée de vie des buffers | Texture, encodeur, manifeste |
| `beam-camera-wgpu` | `CameraPreview::update(&Device, &Queue)` donnant vue/PTS/dimensions | Texture réutilisée, conversion ou import GPU | Capture périphérique, muxage |
| `beam-media-encode` | `open_track`, `push_video/audio`, `finish_track` | GStreamer, files bornées, EOS, fichiers partiels | Permissions, choix des sources |
| `beam-media-session` | `prepare`, `start`, `stop -> SessionManifest`, événements | Start gate, orchestration, reprise/échec indépendant des pistes | UI, API Electron |
| `beam-media-probe` | CLI `devices`, `record`, `report` | Scénario matériel, métriques, Device wgpu pour le test | Code produit réutilisable |

Les types CPAL, `gst::*` et V4L2/AVFoundation/Media Foundation restent privés aux crates adaptées. La seule dépendance GPU publique est `wgpu` dans `beam-camera-wgpu` : sa version devra coïncider avec celle qu'utilisera ARGUI. Une première texture avec un upload CPU borné satisfait « disponible en wgpu en temps réel » ; l'import IOSurface/D3D11/DMA-BUF n'est ajouté que s'il améliore la mesure sans complexifier la durée de vie des buffers.

Pour préserver le manifeste v2 existant, déplacer d'abord ses IDs, pistes, permissions, modèle, `SessionLayout`, écriture atomique et writer de `capture` vers `beam-media-manifest`, puis les réexporter depuis `capture` le temps de migrer les appels existants. La récupération spécifique aux fichiers curseur reste dans `capture` jusqu'à son propre refactor. Le prototype réutilise ce manifeste pour les pistes et écrit un `measurements.json` propre au banc d'essai pour les ancres détaillées. Une évolution du schéma produit n'est décidée qu'après les essais, avec tests de lecture des anciennes sessions.

Arborescence obligatoire pour les backends matériels :

```text
packages/audio/src/{lib.rs,linux/,macos/,windows/}
packages/camera/src/{lib.rs,linux/,macos/,windows/}
packages/camera-wgpu/src/{lib.rs,upload.rs,macos/,windows/,linux/}  # dossiers créés quand un chemin natif existe
packages/*/test/{lib.rs,linux/,macos/,windows/}              # miroir des chemins de src/
packages/*/test/hardware/                                   # tests matériels conditionnels par OS
```

Les dossiers d'OS contiennent uniquement du code réel ; pas de stubs ni de fallback silencieux. Les fichiers de production restent sous 500 lignes. Le point d'entrée UI futur ne reçoit que des états/événements typés et une vue de texture ; le domaine de capture demeure en Rust.

## 5. Dépendances du prototype

Les blocs ci-dessous conservent les choix initiaux du plan ; les `Cargo.toml` du dépôt et `Cargo.lock` décrivent les dépendances réellement intégrées. Les neuf crates utilisent Rust 1.92, `cpal 0.18.2`, `wgpu 30.0.1` et `gstreamer-rs 0.25`. Les quatre compilations croisées macOS/Windows valident la résolution et le typage ; le lien et l'exécution avec les SDK natifs restent au workflow et aux machines de ces OS. Le runtime GStreamer des bundles doit être au moins 1.24 ; la version candidate commune est 1.28.7.

La racine contient les neuf crates :

```toml
[workspace]
members = [
  "packages/capture", "packages/media-core", "packages/media-manifest",
  "packages/audio", "packages/camera", "packages/camera-wgpu",
  "packages/media-encode", "packages/media-session", "packages/media-probe",
]
resolver = "2"
```

Toutes les nouvelles crates utilisent `edition = "2024"`, `publish = false`, `rust-version = "1.92"` et les lints Rust/Clippy du dépôt. Les dépendances natives restent conditionnelles à leur OS.

### `beam-media-core` : `packages/media-core/Cargo.toml`

```toml
[dependencies]
# Aucune : horloge et types std seulement.
```

### `beam-media-manifest` : `packages/media-manifest/Cargo.toml`

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["serde", "v7"] }
time = { version = "0.3", features = ["formatting"] }
thiserror = "2"

[dev-dependencies]
tempfile = "3"
```

Le déplacement du modèle peut supprimer certaines dépendances proposées si elles restent inutiles ; le code existant tranchera. `capture` remplacera ses définitions locales par cette crate, sans cycle de dépendance.

### `beam-audio` : `packages/audio/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
cpal = "=0.18.2"
crossbeam-channel = "0.5"
thiserror = "2"

[target.'cfg(target_os = "linux")'.dependencies]
pipewire = { version = "=0.10.0", features = ["v0_3_65"] }
```

Le backend PipeWire du prototype est séparé de `capture`. CPAL fournit le micro sur Linux/macOS/Windows et le loopback de sortie Windows. Sur macOS, CPAL gère une sortie simple ; une sortie duplex utilise le tap Core Audio privé de Beam et un périphérique agrégé pour éviter que son micro ne soit pris pour l'audio système. [ScreenCaptureKit audio](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos) reste une option de comparaison si les essais matériels révèlent un défaut.

### `beam-camera` : `packages/camera/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
crossbeam-channel = "0.5"
thiserror = "2"

[target.'cfg(target_os = "linux")'.dependencies]
v4l = "=0.14.0"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6.4"
objc2-av-foundation = "0.3.2"
objc2-core-media = "0.3.2"
objc2-core-video = "0.3.2"
objc2-foundation = "0.3.2"

[target.'cfg(windows)'.dependencies]
windows = { version = "0.62", features = [
  "Win32_Foundation", "Win32_System_Com", "Win32_Media_MediaFoundation",
] }
```

Media Foundation est le premier backend Windows. Ajouter `Win32_Media_DirectShow` uniquement si un test sur un appareil réel démontre son besoin. Tester NV12/YUYV/BGRA et MJPEG ; la crate expose le format natif au lieu de convertir toute frame en RGBA. Le décodage MJPEG éventuel pour l'aperçu est décidé après l'inventaire des caméras du banc d'essai.

### `beam-camera-wgpu` : `packages/camera-wgpu/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
beam-camera = { path = "../camera" }
wgpu = "=30.0.1"
thiserror = "2"
```

`wgpu` n'apparaît pas dans `beam-camera` ou `beam-audio`. Le prototype crée un `Device` dans son binaire, mais la crate reçoit toujours celui de l'appelant. Des dépendances `objc2-metal`/IOSurface, D3D11 ou DMA-BUF sont réservées au gate d'import natif après mesure. Le `wgpu` 30 choisi pour le prototype devra être aligné avec ARGUI avant le branchement UI.

### `beam-media-encode` : `packages/media-encode/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
gst = { package = "gstreamer", version = "0.25", features = ["v1_24"] }
gst_app = { package = "gstreamer-app", version = "0.25", features = ["v1_24"] }
gst_audio = { package = "gstreamer-audio", version = "0.25", features = ["v1_24"] }
gst_video = { package = "gstreamer-video", version = "0.25", features = ["v1_24"] }
crossbeam-channel = "0.5"
thiserror = "2"
```

Garder `gst_audio` et `gst_video` uniquement si leurs types de format/caps sont utilisés dans le writer réel. Une implémentation FFmpeg de remplacement, si elle devient nécessaire, doit rester derrière cette frontière et passer le même banc de PTS/EOS/manifest ; elle n'est pas ajoutée au graphe aujourd'hui.

### `beam-media-session` : `packages/media-session/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
beam-media-manifest = { path = "../media-manifest" }
beam-audio = { path = "../audio" }
beam-camera = { path = "../camera" }
beam-media-encode = { path = "../media-encode" }
crossbeam-channel = "0.5"
thiserror = "2"
```

### `beam-media-probe` : `packages/media-probe/Cargo.toml`

```toml
[dependencies]
beam-media-session = { path = "../media-session" }
beam-camera-wgpu = { path = "../camera-wgpu" }
wgpu = "=30.0.1"
pollster = "0.4"
serde_json = "1"
```

Le binaire parse une petite liste d'arguments sans framework CLI tant que trois commandes suffisent. Il expose `--camera`, `--microphone`, `--system-output`, `--duration`, `--preview-delay-ms`, `--output` et produit `manifest.json`, `measurements.json`, `camera.webm`, `microphone.wav`, `system-audio.wav`. Il ne crée pas de fausses données lorsqu'une source manque.

### `capture` existant, au moment de l'intégration

```toml
[dependencies]
beam-media-core = { path = "../media-core" }       # déjà présent
beam-media-manifest = { path = "../media-manifest" } # après extraction v2
beam-media-session = { path = "../media-session" }   # après G6
```

`capture` ne dépend directement ni de CPAL, ni de GStreamer, ni de wgpu pour ces nouveaux flux. Supprimer ses anciennes implémentations seulement lorsque les sessions existantes et le protocole de l'engine passent leurs tests de compatibilité.

## 6. Flux, horloges et comportement d'échec

```text
backend OS -> frame/paquet + timestamp natif -> ancre SessionClock -> PTS ns
                                                   ├─> file bornée encodeur -> appsrc -> piste
                                                   └─> dernière frame caméra -> texture wgpu
```

1. `prepare` découvre et vérifie les trois sources et plugins, réserve les fichiers `.part`, crée la clock, puis les streams ; `start` ouvre simultanément le start gate. Une piste absente ou refusée apparaît comme telle dans le manifeste. Le programme ne crée pas de piste vide qui ressemble à une capture réussie.
2. Un adaptateur d'horloge par source traduit les timestamps du périphérique vers `session_ns`. CPAL fournit `capture` et `callback` ; utiliser `capture` lorsque vérifié. Le compteur d'échantillons fixe les frontières successives des paquets audio. Enregistrer les ancres et discontinuités pour distinguer latence fixe et dérive progressive.
3. Les callbacks matériels ne bloquent ni sur le GPU, ni sur le disque, ni sur GStreamer. Chaque transfert a une capacité explicite en frames **et en octets** ; un plein provoque un événement et des métriques. L'aperçu remplace son ancienne frame. L'enregistrement ne suit pas la cadence de l'UI.
4. `appsrc` annonce `is-live=true`, `format=time`, des caps exactes et des PTS issus de la session. Une file et un worker par piste isolent les encodeurs. `stop` ferme les producteurs, pousse EOS, attend le bus/les fichiers, `fsync` et renomme les `.part`, puis finalise le manifeste. Erreur d'EOS, fichier ou plugin : état `failed`/`interrupted` avec chemin et cause, jamais `completed`.
5. La texture wgpu est recréée seulement si dimensions/format changent ; la conversion YUV->RGB par shader et la réutilisation des buffers sont privilégiées. La première implémentation peut copier les plans natifs vers le GPU. Les options IOSurface/Metal, D3D11 et DMA-BUF ne sont retenues que si la latence, les copies et la mémoire le justifient sur chaque OS.

## 7. Checklist et gates de livraison

Une case reste ouverte tant que tous ses essais et critères, notamment les essais matériels sur chaque OS, ne sont pas validés. La présence du code seul ne suffit pas à fermer un gate.

### G0 — Socle et frontières

- [x] Lire `docs/UI.md`, `docs/ARCHITECTURE.md`, `docs/CODE_QUALITY.md` ; étudier Cap sans reprendre ses crates ou son code.
- [x] Créer `beam-media-core`, raccorder l'horloge et le mapper existants ; tests et Clippy ciblés Linux réussis.
- [x] Relever les versions minimales macOS/Windows et les distributions Linux réellement visées par Beam ; le tap Core Audio impose au moins macOS 14.2 (voir `native-media-api.md`).
- [x] Fixer les états de piste, erreurs, événements et ownership des buffers dans une revue d'API d'une page (`native-media-api.md`).
- [x] Extraire le manifeste v2 et l'écriture atomique de `capture` vers `beam-media-manifest`, avec tests de lecture d'anciennes sessions et de reprise d'écriture interrompue.

**Gate :** mêmes JSON v2 avant/après extraction, aucun cycle Cargo, tous les fichiers source <500 lignes.

### G1 — Writer GStreamer avant les périphériques

- [ ] Relever le MSRV à Rust 1.92, installer les SDK GStreamer/ALSA et compiler `gstreamer-rs 0.25` sur les trois OS.
- [x] Implémenter trois `appsrc` avec données synthétiques déterministes, PTS/durées, EOS et fichiers `.part`.
- [ ] Vérifier `camera.webm` VP8 et deux WAV par lecture indépendante ; tester timestamps non monotones, file pleine, plugin absent, disque plein et arrêt pendant l'initialisation.
- [ ] Inventorier les bibliothèques/plugins du bundle et leurs licences ; exclure `gst-libav` et les plugins GPL du profil initial.

**Gate :** PTS caméra monotones, nombres d'échantillons WAV exacts, erreurs attribuées à la bonne piste, ressources libérées après arrêt.

### G2 — Deux captures audio

- [ ] CPAL micro : découverte, sélection, F32/I16, permission, timestamp, débranchement et changement de périphérique sur chaque OS.
- [ ] Extraire l'audio système PipeWire Linux existant, en conservant ses tests et son comportement de récupération.
- [ ] CPAL WASAPI loopback Windows : sélectionner le périphérique de sortie, tester silence, haut-parleurs USB/Bluetooth et changement de sortie.
- [ ] CPAL Core Audio tap macOS : tester sortie simple et périphérique duplex, permission, arrêt/redémarrage, sortie Bluetooth et absence de modification audible du format de sortie ; si ce gate échoue, implémenter le tap Core Audio directement dans `src/macos/` et mesurer ScreenCaptureKit en comparaison.
- [ ] Enregistrer les positions d'échantillons et les ancres ; deux WAV réellement distincts, y compris quand seul l'un des flux échoue.

**Gate :** micro et audio système audibles dans leurs pistes respectives, aucun blocage de callback, horodatages et pertes observables.

### G3 — Webcam native

- [x] Linux V4L2 mmap ; macOS AVFoundation ; Windows Media Foundation, chacun dans son dossier OS.
- [ ] Découverte stable, négociation résolution/fps/format, permissions, frames timestampées et arrêt/déconnexion.
- [ ] Mesurer YUYV/NV12/BGRA/MJPEG sur au moins une caméra intégrée et une USB ; n'ajouter DirectShow ou un décodeur MJPEG supplémentaire que pour un appareil démontré.
- [x] Envoyer la même capture vers la file d'enregistrement et la boîte « dernière frame » de l'aperçu, sans garder les buffers natifs trop longtemps.

**Gate :** une seule ouverture du périphérique, frames réelles et monotonie contrôlée, aucune rétention non bornée.

### G4 — Texture wgpu sur Device appelant

- [x] Créer l'aperçu avec Device/Queue fournis, texture réutilisée et PTS associé ; gérer redimensionnement, arrêt et destruction du Device.
- [ ] Mesurer fps, latence, copies CPU, octets alloués par frame et mémoire GPU ; comparer upload réutilisé et import natif seulement si utile.
- [x] Vérifier que ralentir l'appelant wgpu ne réduit pas le débit de la piste enregistrée sur la caméra Linux intégrée (100/100 frames sans délai, 101/101 avec 500 ms par aperçu ; 16 frames affichées dans le second cas).

**Gate :** preview temps réel pendant l'enregistrement, sans allocation de texture par frame à format constant.

### G5 — Session complète sans UI

- [x] Relier les trois sources, les trois writers, le start gate et le manifeste via `beam-media-session`.
- [x] CLI `beam-media-probe` avec `devices`, `record`, `report` ; produire les cinq artefacts annoncés.
- [ ] Tester arrêt normal, arrêt forcé, permission refusée, source manquante, hot-unplug, disque plein et sortie qui change.
- [ ] Mesurer avec un clap ou signal de référence pour distinguer offset initial et dérive ; conserver les données brutes de mesure.

**Gate :** trois pistes lisibles, états/erreurs fidèles au manifeste, offsets et dérive rapportés sans valeur inventée.

### G6 — Compatibilité, bundle et performance

- [ ] Exécuter le même scénario 5 puis 30 minutes sur macOS, Windows et Linux X11/Wayland ; au moins une caméra USB et les cas de sortie audio ci-dessus.
- [ ] Publier dans le rapport RSS de tout l'arbre de processus, CPU, mémoire GPU, cadence acquise/encodée/affichée, profondeur des files, drops, latence preview, offset initial et pente de dérive.
- [ ] Comparer au Beam Electron actuel sous la même résolution, durée et matériel ; vérifier que la mémoire se stabilise après démarrage et que les fichiers restent récupérables après erreur.
- [ ] Bundler la même version de GStreamer et l'allowlist de plugins sur les trois OS ; tester des machines propres sans GStreamer préinstallé, licences/notices incluses.
- [ ] Si GStreamer échoue sur un gate bloquant, écrire les mesures, examiner le packaging ou le plugin en cause, puis seulement évaluer un backend FFmpeg LGPL isolé dans `beam-media-encode`.

**Gate :** compilation et essai matériel sur chaque OS, aucune dérive croissante non expliquée, mémoire bornée, bundle autonome et inventaire de licences revu. Les seuils chiffrés de latence et de RSS seront fixés après la mesure de référence, avant les optimisations.

Avant de déclarer ce goal terminé, migrer les tests Rust existants vers le miroir `test/`, enregistrer les cibles `[[test]]`, puis exécuter Nextest et les gates stricts : au moins 85 % de couverture des lignes source du workspace et de chaque crate, y compris les chemins d'erreur. Utiliser le `target-dir` partagé configuré, sans créer de répertoire de build dans la worktree.

### G7 — Intégration produit ultérieure

- [x] Brancher les APIs du prototype à l'engine Rust derrière la feature `native-media` et les exposer par le pont Electron typé.
- [ ] Retirer les sidecars Chromium correspondants et migrer le modèle/éditeur sans perdre la lecture des anciennes sessions ; activer ensuite la feature dans le bundle distribué avec le runtime GStreamer privé.
- [ ] Reprendre ensuite seulement la capture écran pour donner ses frames au même temps/encodeur ; les chemins écran actuels peuvent rester en service jusqu'à leur gate.
- [ ] Brancher ARGUI sur les commandes/états et la texture wgpu, sans déplacer la logique média dans l'UI.
- [ ] Mettre à jour `docs/ARCHITECTURE.md`, les tests d'intégration et `CHANGELOG.md` au moment du changement utilisateur réel.

Le prototype utilise actuellement les SDK de développement GStreamer et ALSA installés sur la machine Linux. Les détails de son API sont dans [native-media-api.md](native-media-api.md), l'inventaire initial de plugins dans [native-media-bundle.md](native-media-bundle.md) et les scénarios matériels des trois OS dans [native-media-platform-smoke.md](native-media-platform-smoke.md). Le workflow `native-media.yml` installe les SDK GStreamer officiels 1.28.7 sur macOS et Windows, puis compile, lint et lance les tests Rust du workspace sur les trois OS. Il prévoit des builds de bundles privés sur Fedora, macOS et Windows et des vérifications séparées sans installation GStreamer. Il n'a pas encore été exécuté sur GitHub et ne prouve pas les essais matériels. Les gates matériels macOS/Windows ne peuvent pas être déclarés réussis depuis Linux.
