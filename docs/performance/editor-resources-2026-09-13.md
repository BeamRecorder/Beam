# Ressources de l’éditeur — mesures du 13 septembre 2026

Les quatre lots approuvés sont implémentés à partir de `dede27fd`. Les gains démontrés concernent surtout le CPU au repos et pendant les réglages, la mémoire des fenêtres auxiliaires pendant l’édition et les images conservées pour les miniatures. Aucun gain de pic mémoire de l’export vidéo n’est établi.

## Protocole

Mesures Linux sur Intel Core Ultra 5 125H (18 threads), 30,8 Gio de RAM, Intel Arc/Mesa, Fedora 44 / Linux 7.1.12, Electron 43.4.1 / Chromium 150. Builds de production, fenêtres présentées dans un compositor Mutter privé : aucun test visuel, aucune fenêtre sur le bureau utilisateur. L’accélération canvas/compositing est vérifiée après chargement ; les premiers logs GPU, pris avant création de fenêtre, ne décrivent pas son état final. Ces mesures ne quantifient pas la VRAM ni un gain GPU séparé.

Le lancement complet utilise le main, le preload, les gestionnaires de fenêtres et les IPC réels. Les essais isolés utilisent les composants et workers réels, les protocoles média, stores et exports natifs ; préférences, presets et listes de projets proviennent de fixtures. Vivid Pixel et le projet Screenshot sont copiés dans `/tmp`. Aucun preset, média original ou presse-papiers utilisateur n’est modifié.

La RAM est la **PSS** cumulée des processus de Beam et de leurs descendants natifs. Elle répartit les pages partagées, contrairement à une somme RSS. L’USS est la mémoire privée. Le compositor de test est exclu. Un Mio vaut 1 048 576 octets. Les relevés toutes les 500 ms et aux limites de phase peuvent manquer un pic bref, notamment pendant un PNG.

Le CPU est exprimé en secondes d’un cœur, cumulées entre processus. Le coût synchrone de la sonde est soustrait approximativement ; les résultats proches de zéro signifient « inférieur à la précision de mesure ». Aucun GC forcé dans les résultats usuels ; les mesures après GC diagnostique sont indiquées séparément. Le cache disque de l’OS n’est pas vidé.

Chaque session vidéo comprend chargement, stabilisation, 8 secondes de pause, 180 changements d’ombre avec interaction active, 30 mises à jour espacées de 400 ms, stabilisation, export(s) WebM, annulation et retour au repos. Le P95 mesure l’attente jusqu’au RAF suivant une mise à jour scriptée, pas la latence physique souris-écran. Les 30 étapes appellent directement les méthodes de réglage ; elles ne simulent pas toutes les entrées DOM d’un utilisateur.

## Résultats avant/après

Les médianes vidéo ci-dessous utilisent deux sessions initiales et deux sessions finales sans profileur CPU, réalisées avant la dernière série perturbée par une autre charge graphique. Les comparaisons intermédiaires et les relevés perturbés sont conservés, même lorsqu’ils sont moins favorables.

| Mesure | Avant | Après | Lecture |
|---|---:|---:|---|
| Application complète, Vivid ouvert en pause | 675 Mio PSS / 506 Mio USS | 605 Mio PSS / 442 Mio USS | Environ **70 Mio PSS de moins**, soit 10 % ; confirmé autour de 602–605 Mio dans les ouvertures suivantes |
| HUD seul, fenêtres auxiliaires préparées | 426–442 Mio PSS | 433–439 Mio PSS | Pas de réduction annoncée : la préparation rapide reste disponible dans le HUD |
| Vidéo isolée, 8 s au repos, CPU médian | 2,56 s | 0,033 s | Environ 32 % d’un cœur → moins de 1 % ; première comparaison 28 % → moins de 1 % |
| 180 réglages d’ombre, CPU médian | 7,18 s | 5,43 s | **−24 %**, stabilisation de 1,5 s incluse |
| Même geste, durée médiane | 6,07 s | 4,93 s | −19 % |
| Même geste, P95 des deux sessions | 39,1 / 58,0 ms | 30,6 / 31,7 ms | Cadence améliorée dans ces sessions |
| Même geste, pic PSS médian observé | 623 Mio | 591 Mio | Environ −32 Mio |
| Premier export vidéo de chaque session, durée médiane | 9,27 s | 9,30 s | Pas de gain établi |
| Même export, CPU médian | 43,64 s | 44,61 s | +2,2 % sur deux mesures ; variation à surveiller, pas un gain |
| Même export, pic PSS médian observé | 858 Mio | 855 Mio | Pas de gain significatif établi |
| Trois sources 4K conservées pour miniatures | 380 Mio PSS | 304 Mio PSS | **−76 Mio** dans l’essai isolé, sans GC forcé |

Les exports complets initiaux durent 9,12–10,01 s (quatre fichiers), les premiers exports finaux 8,96–9,69 s (trois fichiers). Les coûts CPU se recouvrent : 43,54–48,10 s avant, 43,81–46,38 s après. Le code d’encodage vidéo et ses réglages n’ont pas été modifiés. Ces échantillons ne permettent pas d’affirmer une absence de toute régression sur toutes les timelines.

## Changements et mesures par lot

1. **Instantané d’export au clic.** La topbar reçoit des métadonnées légères et une fonction de création. Les changements d’apparence ne recopient plus les événements du curseur pour un popover fermé. Le clic fige une seule requête avant l’attente de sauvegarde du preset ; export et rapport utilisent cette requête. Première comparaison isolée : CPU du geste 6,01 → 5,39 s, P95 39,1 → 31,0 ms. Les paramètres modifiés juste avant le clic et pendant l’attente sont couverts par les tests.

2. **Moniteur et graphique au repos.** Arrêt des RAF et de l’intervalle de mesure quand l’éditeur est inactif ou caché ; reprise avec de nouvelles références temporelles pendant lecture, traitement média, export ou interaction. Un graphique plat n’anime plus des pixels identiques. Après ce lot : 2,24 → 0,028 s CPU sur environ 8 s de pause ; geste à 3,86 s CPU / P95 24,4 ms dans ce passage. Ce passage unique était meilleur que certaines répétitions finales : les écarts entre passages ne sont pas des gains additifs garantis.

3. **Fenêtres auxiliaires liées au HUD.** Le compte à rebours et le téléprompteur sont préparés dans le HUD, libérés pendant l’édition, puis préparés en parallèle du retour au HUD. Le téléprompteur transmet son brouillon, sa session et sa position avant destruction ; timeout, mauvais acquittement et retour rapide conservent le brouillon. Une annulation de compte à rebours ne recrée pas sa fenêtre. Le lecteur restaure son état avant de signaler qu’il est prêt.

   Première mesure : HUD de retour en 58 ms, compte à rebours chargé à 303 ms, téléprompteur à 347 ms après la demande. Une répétition donne 23 ms / 219 ms / 472 ms. La dernière, perturbée, donne 324 ms / 1 999 ms / 1 914 ms : les deux auxiliaires restent bien cachés. Les temps de navigation ne mesurent pas une garantie d’accès instantané sur toutes les machines. Le démarrage initial et l’ouverture de l’éditeur ne montrent pas de gain de vitesse fiable.

   Le test réel a révélé que `document.hidden` pouvait rester faux dans une fenêtre native préchargée cachée. La visibilité native gouverne désormais aussi l’autoscroll. La restauration évite le défilement doux : brouillon de 1 429 caractères inchangé et position 123 → 124 pixels dans le dernier aller-retour, à l’arrondi/mise en page près. Les deux renderers sont effectivement détruits puis recréés.

4. **Géométrie, caches et surfaces temporaires.** Les groupes de pistes ne mesurent leurs positions que si l’ordre ou les identifiants changent. Les animations de déplacement, les déplacements interrompus, l’échelle et la préférence de mouvement réduit sont conservés. Les tests vérifient l’absence de lecture de géométrie sur un simple changement de propriété ; le benchmark global ne permet pas d’isoler un gain CPU supplémentaire fiable de ce seul composant.

   Le cache d’illustrations du curseur est limité à 32 entrées et 16 Mio de pixels RGBA référencés. Les PNG ne sont plus recopiés en cache pour chaque taille d’affichage. L’éviction ne vide jamais une image encore utilisée par un consommateur. Sur 160 variantes SVG, la PSS immédiate reste autour de 327 Mio ; après GC diagnostique, 326 → 303 Mio. Le chargement passe de 645 à 698 ms dans cet essai : ce bornage traite la rétention, pas une accélération du chargement initial.

   Les miniatures de composition conservent au plus trois bitmaps de 512 px sur leur grand côté, au lieu des sources 4K. Dimensions intrinsèques et coordonnées de crop restent distinctes du raster ; le canvas principal et l’export utilisent leurs sources pleine qualité. Replier Composition termine son worker en gardant les miniatures déjà prêtes. La préparation des trois images passe de 123 à 207 ms, CPU 0,16 → 0,23 s ; PSS 380 → 304 Mio sans GC, 379 → 297 Mio après GC diagnostique. Le coût initial supplémentaire se situe dans le worker.

   Les surfaces de rendu et de composition de l’export Screenshot sont vidées après encodage, même en cas d’erreur. Essai 4K : deux surfaces de 3840×2160 deviennent 0×0 ; PNG identique. La PSS globale reste autour de 428 Mio avant GC et 421 Mio après : **aucun gain RAM global n’est revendiqué pour cette libération seule**.

## Option rejetée et limites

Une validation PNG en flux, remplaçant le décodage NativeImage, a été essayée puis retirée : moins de mémoire dans le microbenchmark, mais davantage de CPU avec les petits buffers, et avantage insuffisamment stable avec les grands. La validation native, le presse-papiers et les écritures atomiques restent inchangés.

D’autres benchmarks Chromium/GPU et une application graphique native ont tourné sur la machine pendant les dernières comparaisons. Un export initial a alors atteint 42,65 s et un export final 14,24 s ; une nouvelle répétition initiale a atteint 34,70 s. Ces temps ne servent pas à annoncer un gain. La dernière répétition vidéo finale a terminé avec 0,024 s CPU sur 8,04 s de pause, 4,49 s CPU / P95 27,3 ms pendant le geste et un export en 9,85 s (48,14 s CPU, pic PSS 845 Mio). La répétition Screenshot suivante a été interrompue pendant les réglages : de nouvelles compilations et des tests natifs parallèles saturaient la machine (pression CPU moyenne sur 60 s autour de 24 %). Ses phases partielles restent dans les journaux ; elle ne constitue pas une validation de performance supplémentaire. Les exports Screenshot complets précédents et leurs comparaisons binaires restent disponibles. Les processus des autres travaux n’ont pas été interrompus. Les journaux et l’état de charge sont conservés dans les artefacts ; cette machine partagée limite la précision des comparaisons de latence et du CPU d’export.

La baisse de mémoire du HUD et celle des essais isolés ne s’additionnent pas : les processus et pages partagées diffèrent. Les petits caches peuvent nécessiter une nouvelle préparation après éviction. Le projet vidéo mesuré a trois clips ; ce rapport ne démontre pas les mêmes pourcentages sur une très grosse composition. Les 50 états undo/redo, la qualité de rendu et les paramètres de sortie sont conservés. Windows, macOS et les périphériques physiques n’ont pas été mesurés dans cette passe.

## Validation et artefacts

La validation initiale couvre 352 tests Vitest dans 26 fichiers ciblés, 46 tests Node, les deux typechecks et le build de production. Couverture des modules instrumentés : instructions 99,14 %, branches 97,36 %, fonctions 99,18 %, lignes 100 %. Après les corrections finales du téléprompteur : 27 tests Vue/composable et 19 tests Node passent à nouveau ; couverture de ces deux modules 99,68 % des instructions, 99,48 % des branches, 100 % des fonctions et lignes. Le typecheck Vue et le build de production ont également été relancés avec succès. Aucune suite complète ni test visuel n’a été lancé.

Les fichiers vidéo de référence et optimisés vérifiés sont identiques : WebM de 9 245 074 octets, SHA-256 `cdeaf1577168b7e47950d6d77102856d6ef7246ff235038209d49ba63cc7d622`, VP9 1920×1080 à 30 fps, audio Opus, durée conteneur 12,18 s. PNG Screenshot : 680 887 octets, SHA-256 `4a2b625f3ab2664fc371ba0aafc55573f51a72c2bc5ece8457d4e181b3600d79`, 1920×1080. Au total, 19 fichiers exportés ont été comparés avec succès et les hashes des 15 fichiers originaux de Vivid Pixel sont inchangés. Les annulations testées ne produisent ni erreur UI ni fichier `.partial` restant.

Les données et scripts locaux sont réunis dans `/tmp/beam-resource-optimizations-2026-09-13/` : `summary.json`, résultats complets par passage, journaux, scripts de build instrumenté et d’exécution. Les builds de référence sont `/tmp/beam-resource-build` et `/tmp/beam-resource-screenshot-build`, les builds finaux `/tmp/beam-resource-stage4` et `/tmp/beam-resource-screenshot-stage4`. Les fixtures privées restent hors Git. L’instrumentation et les mesures de processus n’entrent pas dans le code produit.
