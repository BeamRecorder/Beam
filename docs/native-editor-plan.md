# Plan de l’éditeur vidéo non destructif et programmable

Statut : implémentation en cours, 29 septembre 2026. Les gates finaux P0–P11 ne sont pas encore tous validés.

Ce document fixe les critères d’acceptation et suit l’implémentation. Les preuves intermédiaires ci-dessous ne remplacent pas les gates finaux. Le périmètre couvre les six axes demandés : catalogue d’effets, instances persistantes, régions dans la timeline, inspecteur générique, rendu natif extensible et règles temporelles/historique. Il inclut une API programmable, un SDK, une CLI et un adaptateur MCP.

## Suivi de l’implémentation

| Lot | État intermédiaire | Preuves et travail restant |
| --- | --- | --- |
| P0 | En cours | ADR et contrats Rust générés ; baseline native 1/10/100 FX mesurée. Mesures finales et CI de dérive à terminer. |
| P1 | En cours | V2 en blocs immuables, recovery, historiques indépendants et historique projet ; partage COW, chargement paresseux, GC et migration scalaire complète en cours. |
| P2 | En cours | Batches atomiques, dry-run, révisions, createdBy/index et reçus persistés ; événements des imports et jobs à compléter. |
| P3 | En cours | Temps rationnels et mapper partagé fallible, interpolation hold/linear/Bézier, espaces source/clip/séquence ; audit final des frontières de cadence. |
| P4 | En cours | Instances indépendantes, ordre, activation, plages, duplication et noms ; presets versionnés à finaliser. |
| P5 | En cours | Updates conservant les décodeurs et fenêtre native active ; 10 000 clips testés avec 14 clips GES. Fusion des FX et export segmenté en cours. |
| P6 | En cours | Zooms et curseurs synchronisés par pixels réels, styles hérités et overrides persistés ; intégration UI et validation finale à terminer. |
| P7 | En cours | Sélection multiple, AV lié, copy/paste de pistes, gestes annulables et requête Rust de régions ; régions visuelles et contrôles de pistes à terminer. |
| P8 | En cours | Inspecteur générique typé, stack virtualisée, keyframes, références temporelles et vraies transitions ; QA native et densité à vérifier. |
| P9 | En cours | Effet GLSL externe et transition à masque animée rendus réellement ; contrat documentaire et test générateur externe à finaliser. |
| P10 | En cours | SDK/CLI/MCP utilisent le même broker et service ; scénario réel pour les trois transports, restart et SHA256 source. Artefacts, jobs persistés et requêtes compactes à compléter. |
| P11 | En cours | Export matériel testé : refus explicite 64×64, fichier exactement 128×96 après transaction distincte ; snapshots/jobs/annulation et checks multiplateformes à terminer. |

Les scénarios des trois transports ont été exécutés sur Linux, sans fenêtre. Ils couvrent import, découpe, animation, instances répétées, définitions externes, undo/redo, arrêt du propriétaire, réouverture et export. Les limites de l’encodeur proviennent de ses véritables caps ; aucun redimensionnement ou encodeur CPU silencieux n’est accepté.

## 1. Résultat attendu

Un projet décrit des décisions de montage, sans modifier ses sources. Toute opération de contenu réalisable dans l’interface est accessible par les mêmes commandes programmatiques. Une nouvelle famille d’effets apporte sa définition, sa validation et son traitement, sans réécrire la timeline, l’inspecteur, l’historique ni les transports.

Le premier parcours complet est concret : ouvrir un enregistrement, afficher ses zooms dans la timeline, modifier leur durée et leur cible, ajouter un filtre et une transition entre deux clips, annuler/rétablir, rouvrir le projet et exporter. Le même parcours doit fonctionner depuis un script et MCP, sans nécessiter de clics ni de fenêtre.

Contrats existants à respecter : [UI](UI.md), [architecture](ARCHITECTURE.md), [qualité](CODE_QUALITY.md) et [fenêtres Electron](electron_window.md) si une étape touche ce host. L’éditeur reste natif ARGUI/Solid avec un moteur Rust/GES ; le domaine capture et l’éditeur de captures d’écran restent séparés.

## 2. État constaté et travail à préserver

| Sujet | État actuel | Évolution |
| --- | --- | --- |
| Sources | Imports immuables, manifeste de capture distinct, verrou et checkpoints | Conserver ; ajouter identité/révision et vérification de source |
| Séquences | Sources partagées, montages et undo/redo indépendants | Conserver l’indépendance, supprimer la duplication d’état actif dans le nouveau modèle |
| Filtres | Original, Vivid, Monochrome, Soft modifient luminosité/saturation | Presets d’un effet de correction couleur, avec pile d’instances |
| Effets | Structure plate : couleur, cadrage, opacité, gain, autoZoom, fondus | Définitions et instances versionnées, paramètres animables |
| Zooms | Plages stockées sur la source, sans identifiant ; la vue expose seulement un nombre | Suggestions immuables puis instances éditables propres au clip |
| Transitions | Fondus d’opacité/gain ; recouvrement de clips sur une piste interdit | Relation explicite entre deux clips, poignées média et mélange de deux entrées |
| Rendu | Composition GES/GL commune à preview/export | Compiler les modules vers ce rendu et appliquer les changements ciblés |
| Validation d’un edit | Reconstruit la preview, remplace les frames et écrit le document | Séparer changements de paramètres, de temps et de structure |
| Visuels source | Filmstrips et Blick natifs, demandes visibles, caches bornés | Réutiliser leurs leases, annulation et identités source |
| Interface | Primitives natives, accent Beam, onglets et resize retenus | Réutiliser ; préserver reflow immédiat et absence de mouvement JS pour les panels |
| Automatisation | Services typés, mais import/ouverture/export dépendent de dialogues du host | Ajouter des références autorisées sans dialogue pour les clients programmatiques |
| Taille de montage | Validation actuelle : 512 sources, 2 048 clips, 32 pistes et document de 64 MiB | Remplacer les plafonds de nombre par un modèle indexé/paginé et des budgets opérationnels |

Références du constat : [modèle actuel](../packages/editor-domain/src/project/types.rs), [intents](../packages/editor-domain/src/timeline/types.rs), [presets](../packages/beam-ui/src/solid/editor/media/libraryModel.ts), [pipeline](../packages/editor-engine/src/video/pipeline.rs), [commit](../packages/editor-engine/src/video/worker.rs), [services du host](../apps/beam-native/src/editor/mod.rs), [visuels et panels](native-video-editor.md).

## 3. Invariants d’architecture

1. Les octets source et la télémétrie ne sont jamais réécrits par un edit, ni recopiés dans chaque état d’undo. Un proxy ou un export est un dérivé identifié séparément.
2. Rust possède le document, les règles métier, la validation, les transactions et le rendu. Solid affiche des projections et émet des intentions.
3. UI, SDK, CLI et MCP appellent le même service de commandes. Aucun adaptateur n’écrit directement le JSON du projet.
4. Un seul propriétaire écrit un projet. Les clients partagent son acteur ; une révision périmée produit un conflit explicite.
5. Un commit de contenu est atomique : une révision, un changement d’historique, une publication persistante et un événement cohérent. Un rejet conserve l’état accepté.
6. Sélection, panneau actif, scroll, taille des panels et zoom de l’interface appartiennent à la session UI, hors montage et undo.
7. Temps, espaces de coordonnées, unités et ordre de rendu sont explicites. Les bornes temporelles utilisent des intervalles semi-ouverts.
8. Preview et export évaluent les mêmes décisions et courbes. La résolution de preview n’altère jamais le montage ni les paramètres d’export.
9. Aucun pixel, PCM ou handle GPU ne traverse les commandes JSON ordinaires. Les ressources volumineuses utilisent des leases ou des artefacts bornés.
10. Une fonctionnalité indisponible reste visible avec une erreur exploitable. Aucun effet absent, shader incompatible ou source manquante n’est ignoré silencieusement.

## 4. Couches et responsabilités

~~~mermaid
flowchart TD
    UI["Solid / ARGUI"] --> Service["Service Rust : commandes, requêtes, événements"]
    SDK["SDK / CLI"] --> Service
    MCP["Adaptateur MCP local"] --> Service
    Service --> Domain["Document, temps, effets, transactions, historique"]
    Domain --> Store["Store atomique et migration"]
    Domain --> Compiler["Compilation de composition et invalidation"]
    Compiler --> GES["Acteur GES / OpenGL : preview et export"]
    Service --> Assets["Sources, visuels, jobs et capacités"]
    GES --> Frames["Leases GPU vers ARGUI ou artefacts headless"]
    Domain --> Views["Projections compactes et événements révisionnés"]
    Views --> UI
    Views --> MCP
~~~

Organisation cible, à introduire par étape :

| Emplacement | Responsabilité |
| --- | --- |
| packages/editor-domain/src/project/ | Document V2, sources, migrations, checkpoints, verrou |
| packages/editor-domain/src/timeline/ | Séquences, pistes, clips, relations de transition, règles d’édition |
| packages/editor-domain/src/timing/ | Temps rationnel, mapping source/clip/séquence, bornes |
| packages/editor-domain/src/effects/ | Catalogue, définitions, instances, presets, validation et modules métier |
| packages/editor-domain/src/animation/ | Paramètres animés, interpolation et évaluation seek-safe |
| packages/editor-domain/src/commands/ | Transactions, commandes de domaine, conflits et résultats |
| packages/editor-domain/src/commands/query.rs | Requêtes paginées et projections sans télémétrie lourde |
| packages/editor-domain/src/protocol/ | Contrats de transport, erreurs et génération des schémas |
| packages/editor-engine/src/video/ | Backend GES/GL, ressources et mises à jour du rendu |
| packages/editor-engine/src/export/ | Snapshot figé, jobs, annulation et publication |
| apps/beam-native/src/editor/ | Dialogues, grants, fenêtres, canvas et adaptation des services |
| packages/beam-ui/src/solid/editor/ | Vues, timeline, inspecteur et gestes utilisant les primitives partagées |
| packages/editor-sdk/ | Client TypeScript généré et helpers de temps/transactions |
| apps/beam-editor-cli/ et apps/beam-editor-mcp/ | Adaptateurs Rust minces vers le service commun |

Les modules proposés ne sont pas des façades vides à créer dès le départ. Chacun arrive avec sa première responsabilité testée. Les dépendances vont des adaptateurs vers le domaine, jamais du domaine vers Solid, MCP ou les fenêtres.

## 5. Modèle non destructif V2

| Élément | Contrat |
| --- | --- |
| ProjectDocument | Version de schéma, projectId, révision globale, bibliothèque, séquences et historique projet |
| Asset | Identifiant stable, référence source gérée par le host, métadonnées réelles, identité/révision de contenu |
| RecordingMetadata | Télémétrie et suggestions d’analyse immuables, accessibles sans les embarquer dans les snapshots de l’UI |
| Sequence | Identifiant, nom, canvas/cadence, pistes, clips, effets, transitions et historique de contenu indépendant |
| Clip | Identifiant, piste, source ou générateur, placement, fenêtre source et référence de mapping temporel |
| EffectDefinition | Identifiant namespacé, version, schéma de paramètres, cibles/entrées compatibles et contrat de traitement |
| EffectInstance | Identifiant, definitionId/version, cible typée, activation, ordre, plage et paramètres/animations |
| RecordingStyle | Profil de séquence versionné pour le curseur et les valeurs initiales de zoom ; références/overrides explicites par clip |
| TransitionInstance | Identifiant, définition, fromClipId/toClipId, plage, poignées média et paramètres |
| ParameterBinding | Valeur constante ou courbe typée ; aucune expression JavaScript arbitraire |
| Keyframe | Identifiant, temps, valeur, interpolation et tangentes lorsque pertinentes |
| Preset | Valeurs versionnées d’une ou plusieurs définitions ; appliquer crée/met à jour des instances explicitement |
| RenderSnapshot | Composition immuable, versions des définitions et sources, paramètres de sortie et identité du graphe |

Les built-ins utilisent des types Rust dédiés. Les paramètres déclaratifs extensibles passent par un ensemble fermé de valeurs typées : nombres finis, booléens, choix, couleurs, points/vecteurs et références gérées. Le schéma valide les clés, limites et contraintes croisées ; une map JSON sans contrat ne devient pas le modèle métier.

Un descripteur de paramètre expose une clé stable, type, unité, espace de coordonnées, valeur initiale déclarée, limites/pas, groupe et possibilité d’animation. Les libellés sont localisables. Un contrôle particulier peut compléter le formulaire partagé sans imposer une UI particulière aux scripts.

Les types Rust et la sérialisation sont la source d’autorité. Générer JSON Schema, types TypeScript, schémas MCP et documentation d’API avec un générateur reproductible ; sélectionner et figer son outillage au lot P0. Vérifier en CI l’absence de dérive plutôt que maintenir plusieurs catalogues à la main.

### Propriété des effets

- Les effets d’un clip appartiennent à sa séquence. Deux clips d’une même source peuvent avoir des zooms et filtres différents.
- Les effets de piste/séquence sont des cibles explicites, déclarées compatibles par la définition. Leur position dans le rendu est documentée.
- Une transition possède deux références de clips ; elle utilise les primitives communes de paramètres, timing et historique, avec sa validation propre.
- Les définitions et shaders sont partagés et immuables ; seules les décisions d’instance sont dans l’historique.
- Un filtre permanent peut être affiché dans une pile compacte. Un zoom ou effet limité dans le temps possède une région visible. Tout effet ne nécessite pas une piste indépendante.
- Ajouter un effet crée une nouvelle instance : plusieurs instances du même FX sur un clip sont autorisées et ordonnées. Modifier/appliquer un preset à une instance existante demande son ID explicitement ; aucune fusion par nom de définition.

### Croissance du montage et piles d’effets

Objectif produit : aucun plafond arbitraire de clips, pistes, sources ou FX par clip. « Infini » désigne ici un nombre extensible selon le stockage et les ressources disponibles, sans promettre une mémoire ou une vitesse de rendu infinies.

- Collections indexées par ID, ordre et intervalle ; requêtes paginées et validation des voisins/dépendances. Modifier un paramètre ne parcourt ni ne copie tout le montage.
- Une pile contient des instances distinctes, y compris plusieurs fois le même effet. Ajouter, nommer, dupliquer, déplacer, désactiver ou supprimer une instance conserve les autres.
- Virtualiser aussi l’inspecteur et sa pile de FX, pas seulement les pistes/clips de timeline. Les régions et handles montés dépendent du viewport.
- Le RenderPlan distingue le document complet des clips actifs et de la fenêtre de préparation. Décodeurs, buffers et jobs sont acquis à la demande ; leur nombre n’est pas égal au nombre total de clips.
- L’export parcourt la composition par plages/segments, retient les décisions du snapshot et réutilise des surfaces de travail. Empiler des FX ne réserve pas une image complète permanente par instance.
- Bornes de batch, queues, mémoire active et jobs restent explicites. Un budget dépassé rend une erreur exploitable ou demande de fractionner le travail ; aucune coupe silencieuse de la pile ou du projet.
- Le plafond de fichier actuel devient un budget de message/bloc. P0 spécifie un manifest versionné référençant des blocs immuables indexés ; P1 livre leur chargement paginé, publication atomique et recovery. Les blocs retenus par historique/export restent accessibles jusqu’à libération.
- Gates de croissance : au moins 10 000 clips, plusieurs pistes, et 100 FX sur un même clip dont plusieurs instances du même type. Publier les coûts mémoire/temps et mesurer des tailles croissantes plutôt qu’annoncer un seuil non mesuré.

Le principe définition/traitement/interface est éprouvé dans [Shotcut](https://www.shotcut.org/notes/make-plugins/). Le formulaire piloté par des descripteurs est une décision propre à Beam ; les contrôles spécialisés restent possibles.

## 6. Temps, courbes et opérations de montage

Représenter le temps par des ticks entiers et une timescale explicite ; représenter la cadence par un rationnel, dont 30000/1001 et 24000/1001. Les helpers SDK acceptent secondes, millisecondes ou frames et produisent cette représentation sans accumulation de flottants. Les valeurs JSON entières doivent rester exactes dans les clients JavaScript.

Chaque plage et animation déclare son repère : clipLocal, source ou sequence. Une fonction centrale effectue les conversions et intersections. À vitesse normale, le temps séquence correspond au début du clip plus le temps source moins son in-point ; cette formule ne doit pas être recopiée dans chaque effet.

Le premier mapping livré reproduit exactement le comportement actuel à vitesse 1. Le contrat prévoit une définition de retiming distincte pour les futures vitesses et rampes ; aucune capacité de retiming n’est annoncée avant un module réel et testé.

| Opération | Règle obligatoire |
| --- | --- |
| Move | Les régions clipLocal suivent le clip ; les cibles sequence gardent leur ancrage |
| Trim | Modifier la fenêtre visible sans écraser les données d’animation récupérables ; borner l’évaluation au clip |
| Split | Créer des IDs distincts, conserver la continuité et remapper les animations selon leur repère |
| Duplicate | Copier les décisions, générer de nouveaux IDs et partager uniquement les sources/définitions immuables |
| Remove | Traiter les effets et relations dépendantes dans la même transaction, sans référence pendante |
| Change frame rate | Garder le temps réel ; le snapping aux frames est une opération explicite |
| Undo/redo | Restaurer timing, paramètres, ordre, relations et identifiants cohérents, même après réouverture |

Les courbes évaluent une valeur à un temps demandé, sans dépendre des frames lues avant. Interpolations communes : constante, linéaire, courbe avec tangentes. Les mouvements caméra à ressort ont un état initial déterministe et des contrôles précompilés/cacheables ; seek, lecture et export doivent retrouver la même caméra.

L’ordre d’une pile est une décision de montage. Le compilateur applique des étapes documentées : mapping/décodage, normalisation image, effets de clip, transitions, composition de chaque piste, effets de piste, composition des pistes, effets de séquence et conversion de sortie. Les transformations caméra et le cadrage ont une composition explicite reproduisant d’abord le V1. Les effets audio respectent leur domaine et leur ordre avant/après mélange.

## 7. API de commandes, transactions et requêtes

Séparer les intentions de contenu, les requêtes, le transport de lecture et les jobs. Une commande possède une cible explicite ; elle ne dépend pas du panneau sélectionné, du playhead local ou de la séquence affichée par un autre client.

| Famille | Opérations prévues |
| --- | --- |
| Découverte | capabilities.get, definitions.list/get, schema.get, presets.list |
| Projets/séquences | project.create/open/get, sequence.create/duplicate/rename/remove/get |
| Pistes/clips | track.add/update/reorder/remove, clip.insert/move/trim/split/duplicate/remove |
| Effets | effect.add/update/remove/reorder/setEnabled/setRange |
| Animation | keyframe.add/update/remove, parameter.setConstant/setCurve |
| Transitions | transition.add/update/remove ; validation des deux clips et poignées |
| Historique | history.get/undo/redo avec scope explicite projet ou séquence |
| Sources | assets.list/get/import/relink, recording.suggestions.get |
| Extensions | extensions.list/validate/register via une grant de pack local |
| Lecture | transport.get/play/pause/seek, preview.setQuality |
| Visuels/artefacts | visuals.acquire/release, preview.renderFrame, artifacts.get |
| Jobs | export.start, analysis.start, jobs.get/list/cancel |
| Exécution | transaction.validate, transaction.apply, changes.subscribe |

Une transaction contient apiVersion, projectId, sequenceId lorsque nécessaire, expectedRevision, idempotencyKey et une liste bornée de commandes. Une référence createdBy désigne le résultat d’une commande précédente du même batch : un script peut insérer un clip puis son zoom sans une succession d’aller-retour.

Exemple de contrat proposé, avec des IDs de projet/séquence/source déjà obtenus par les requêtes :

~~~json
{
  "apiVersion": 1,
  "projectId": "00000000-0000-4000-8000-000000000001",
  "sequenceId": "00000000-0000-4000-8000-000000000002",
  "expectedRevision": 12,
  "idempotencyKey": "insert-screen-and-zoom-001",
  "commands": [
    {
      "commandId": "insert-main",
      "type": "clip.insert",
      "assetId": "00000000-0000-4000-8000-000000000003",
      "trackId": "00000000-0000-4000-8000-000000000004",
      "start": { "ticks": 0, "timescale": 1000 },
      "sourceIn": { "ticks": 0, "timescale": 1000 },
      "duration": { "ticks": 10000, "timescale": 1000 }
    },
    {
      "commandId": "zoom-main",
      "type": "effect.add",
      "definitionId": "beam.camera.zoom",
      "definitionVersion": 1,
      "target": { "kind": "clip", "clip": { "createdBy": "insert-main" } },
      "range": {
        "space": "clipLocal",
        "start": { "ticks": 2000, "timescale": 1000 },
        "end": { "ticks": 5000, "timescale": 1000 }
      },
      "parameters": {
        "scale": 1.8,
        "center": { "x": 0.5, "y": 0.45 },
        "followCursor": false
      }
    }
  ]
}
~~~

Le résultat fournit la nouvelle révision, transactionId, IDs créés par commandId, éléments modifiés et avertissements structurés. Une erreur indique code stable, commande/champ fautif, message et révision courante : RevisionConflict, InvalidRange, MissingAsset, UnsupportedEffect, MissingPlugin, ResourceLimit, Cancelled ou StorageFailure.

Règles de transaction :

- Valider le batch sur un candidat ; toute erreur annule le batch entier. Le dry-run retourne diagnostics/diff sans écritures, historique ni modification du rendu accepté.
- Préparer les ressources nécessaires et les contraintes du rendu avant publication. Le swap final et les bindings préparés ont un chemin de commit contrôlé ; les échecs d’IO/préparation laissent le montage accepté utilisable.
- Une transaction de contenu cible une seule séquence et constitue un seul pas d’undo. La gestion projet possède son historique séparé ; retirer une séquence conserve son état nécessaire à l’annulation.
- Les gestes utilisent begin/update/commit/cancel natifs : les updates sont éphémères et le commit seul écrit l’historique. Escape, capture perdue ou fermeture restaurent l’état accepté.
- Un client automatique envoie un batch final ; il n’a pas besoin de simuler un glissement.
- La même clé d’idempotence et le même payload retrouvent le résultat initial ; une clé réutilisée pour un autre payload est rejetée. Persister une table bornée de reçus avec le commit et déclarer sa durée de rétention.
- Aucun rebase implicite d’un batch périmé. Les clients peuvent relire, corriger et soumettre une nouvelle intention.
- Les imports et exports sont des jobs distincts ; ils ne prétendent pas faire partie d’un rollback de commandes purement documentaires.

Les jobs de publication utilisent aussi une clé d’idempotence et un résultat persistant : réessayer ne duplique pas un import ou un export. Les sources/versions utilisées par un export restent retenues jusqu’à sa fin ; relink publie une nouvelle version de source sans modifier les octets encore utilisés.

Requêtes paginées par séquence/plage, versions des projections et événements avec dirty IDs évitent de renvoyer le document, la télémétrie ou toutes les pistes à chaque changement. Un abonné trop lent peut resynchroniser à une révision connue ; aucun événement perdu ne doit produire une UI fausse.

## 8. Rendu natif et invalidation

Garder GES et les surfaces GPU existantes. Compiler les définitions vers des nœuds de traitement par un adaptateur enregistré ; aucun traitement vidéo frame par frame ne revient dans QuickJS.

| Changement | Travail attendu |
| --- | --- |
| Sélection, onglet, hover, taille de panel | Aucun changement de composition |
| Valeur/activation compatible avec le nœud existant | Mettre à jour propriétés/uniforms/bindings, sans recréer décodeurs ni timeline |
| Courbe/plage/timing | Recompiler les contrôles ou l’index concerné ; ajuster les éléments impactés |
| Insertion/suppression/ordre d’effet ou transition | Préparer la portion structurelle concernée ; swap à une frontière cohérente |
| Source/canvas ou changement imposant une renégociation | Reconstruction préparée explicite, annoncée comme travail média |
| Export | Snapshot figé et pipeline indépendant, aucun changement si l’utilisateur continue à éditer |

Le compilateur produit un RenderPlan et un ChangeSet typés. Des IDs stables relient instances et nœuds ; les clés de cache incluent définition/version, source, espace couleur et backend. Ne pas renégocier les dimensions vidéo pour animer la caméra.

Conserver la dernière frame valide pendant une préparation et publier l’identité/révision de la frame ; ne pas effacer la preview ni rebootstrapper le projet sur un edit. Une défaillance GPU à l’exécution produit un état de rendu indisponible explicite, distinct d’un rejet de document.

Les diagnostics identifient decode, compilation, update, seek, présentation et sauvegarde séparément. Mesurer latence médiane/p95, taille de queues, reconstructions, frames perdues et bytes copiés. Les acteurs et la scène au repos restent endormis.

## 9. Timeline et inspecteur partagés

La projection native décrit les rows, items et régions visibles. Une infrastructure commune possède layout temporel, sélection, hit tests, snapping, menus, poignées, navigation clavier et transactions. Les présentateurs de clip, zoom, effet et transition apportent leur contenu.

Pour les zooms : ligne dépliable sous le clip, plages sélectionnables, ajout/déplacement/trim/suppression et repère visuel de la cible dans la preview. Les suggestions auto sont matérialisées en décisions propres au clip ; modifier un zoom ne touche pas les autres occurrences de la source.

### Parcours hybride enregistrement et montage

Conserver un résultat soigné dès l’ouverture d’une capture Beam, avec une profondeur de montage progressive. Le même projet accueille enregistrements, vidéos importées, audio et éléments générés ; aucun changement de mode n’est requis pour passer du réglage rapide au montage précis.

| Sélection | Inspecteur |
| --- | --- |
| Aucun élément | Style de la séquence et réglages communs aux enregistrements |
| Enregistrement avec télémétrie | Vidéo, cadrage, Curseur et Zooms |
| Région de zoom | Grossissement, cible, suivi et entrée/sortie de cette instance |
| Région curseur/FX/transition | Paramètres propres à la région ou instance sélectionnée |

Le curseur possède un style commun à la séquence : pack/apparence, taille, couleur, ombre, lissage, effets de clic et masquage après inactivité. Un clip peut hériter explicitement de ce profil ou porter des overrides ; l’UI indique le scope et permet de revenir au style commun. Une modification de profil invalide ses consommateurs, pas les clips indépendants. Le snapshot d’export fige le profil et ses versions.

Livrer un module natif de curseur attaché aux données d’enregistrement et utilisant les mêmes descripteurs, bindings, transactions et animations que les autres effets. Les événements/trajectoires restent immuables ; les décisions de rendu sont éditables. La présentation suit le mapping source et la transformation caméra, y compris trim/split/duplication. Le suivi de cible d’un zoom reste indépendant de l’apparence du curseur.

La ligne Curseur est dépliable pour des plages de visibilité ou des paramètres animés. Le parcours simple conserve les onglets Curseur/Zooms dans les propriétés de l’enregistrement. Déclarer la capacité réelle : télémétrie séparée, curseur incrusté dans la vidéo ou absent. Un curseur incrusté n’expose pas un remplacement qui nécessiterait des données inexistantes.

L’inspecteur utilise les descripteurs pour les champs ordinaires et les primitives partagées pour ses rows, sliders, nombres, couleurs et choix. Les valeurs multiples d’une sélection restent explicitement mixtes. Les bornes liées, labels/units et états erreur/chargement sont cohérents dans UI et API.

Critères UI à préserver dans les nouvelles vues :

- Accent primaire Beam, Hanken, Lucide et traductions ; mêmes segmented controls animés que le recorder.
- Tabs de séquences séparés de la toolbar ; libellés alignés à gauche et icônes centrées.
- Panels flexibles, reflow pendant le drag natif, pill de resize centrée visible au hover, aucun callback JS de mouvement de panel.
- IconOnly selon la largeur mesurée ; tooltip uniquement sans libellé, avec délai, largeur intrinsèque bornée et retour à la ligne.
- Sélecteurs dont texte et chevron restent accessibles dans les petites largeurs ; clavier/focus et reduced motion.
- Aucun remount/bootstrap, clignotement de titre ou cursor disabled sur une action disponible.

Filmstrips/audio restent des visuels source mutualisés et virtualisés ; un zoom de timeline réutilise la grille source et les bins prêts. Une miniature de composition éventuelle a sa propre identité RenderSnapshot et son budget ; elle ne détruit pas le cache source.

## 10. Vraies transitions et extensions

Une transition décrit deux entrées, sa plage, ses poignées média et sa politique audio. Commencer par crossfade vidéo/audio, puis un shader à deux entrées. GES possède déjà une [transition entre deux sources](https://gstreamer.freedesktop.org/documentation/gst-editing-services/gestransitionclip.html) et une [pile d’effets ordonnée](https://gstreamer.freedesktop.org/documentation/gst-editing-services/gesclip.html).

Décision proposée pour le premier crossfade : les deux clips restent adjacents sur la même piste dans le document. Une région centrée sur leur cut décrit la transition. Pour un cut à 10 s et une durée de 1 s, sa plage est [9,5 s ; 10,5 s) : le compilateur prolonge les entrées avec 0,5 s de média après la fenêtre A et avant la fenêtre B, uniquement dans le graphe GES. Les poignées doivent réellement exister dans les sources.

Le domaine autorise uniquement les recouvrements de rendu décrits par une transition valide : vérifier voisinage, disponibilité des poignées, durée, nombre de sources et absence de cycle. Deux transitions voisines ne doivent pas créer un mélange de trois sources. Le P0 fige cette décision et ses fixtures ; un manque de média produit un diagnostic, jamais une durée inventée. Livrer d’abord cette politique centrée et la déclarer dans les capacités.

Contrat d’extension à livrer :

1. Un module Rust peut enregistrer une définition, ses types/contraintes et son backend. Il expose les capacités réelles sur la machine.
2. Un pack déclaratif contient un manifeste versionné, presets et shaders autorisés ; ses IDs sont namespacés et son contenu identifié par hash.
3. La première extension externe réelle est un effet vidéo à une entrée et une transition à deux entrées utilisant le pipeline GL existant. Uniforms et animations utilisent les mêmes paramètres.
4. Compiler/cache les shaders par GPU, vérifier interface, formats, alpha/espace couleur et budgets ; un échec conserve la définition/document et expose l’erreur.
5. Enregistrer la version/hash nécessaire à la reproduction d’un projet/export. Un pack manquant ou incompatible reste conservé avec état indisponible et bloque le rendu concerné.
6. Les hooks UI particuliers sont des composants intégrés/revus, jamais du code arbitraire chargé depuis un appel MCP.

Un shader est une implémentation de traitement ; la famille utilisateur reste effet, transition ou générateur. Le WGSL Blick sert déjà à dessiner les waveforms dans ARGUI : réutiliser ses ressources pour ce rôle. Les effets vidéo GL ont un contrat distinct ; un futur backend WGPU doit être un adaptateur réellement intégré, avec sa propriété de frames et ses tests.

MCP permet de découvrir et commander ces capacités. Il ne remplace pas le backend de calcul et ne devient pas un accès shell/dll ou un éditeur libre du JSON.

## 11. SDK, CLI, MCP et exécution sans fenêtre

Le service fonctionne sans ARGUI pour requêtes, édition et stockage ; les jobs de rendu headless utilisent les vraies capacités GStreamer/GPU et ne simulent pas leur disponibilité. Livrer SDK Rust via l’API de crate et client TypeScript généré avec helpers de temps, batches, références de résultats, diagnostics et abonnements.

La CLI accepte des commandes/batches structurés, produit du JSON exploitable, des codes d’erreur stables et des artefacts identifiés. Les logs sont séparés des réponses. Scripts et MCP n’ouvrent pas de dialogue : ils utilisent des références d’import ou de destination autorisées.

### Propriété du projet et accès aux sources

- Lorsqu’un éditeur possède le projet, les adaptateurs s’attachent à son service local authentifié et sérialisé ; ils n’ouvrent pas un deuxième writer.
- Sans éditeur, le host headless acquiert le même verrou. Un conflit de propriétaire est explicite.
- La connexion locale utilise Unix socket ou named pipe selon l’OS, identité/ACL et grant de session ; aucun port réseau public n’est nécessaire.
- Le host convertit une sélection utilisateur ou une configuration de roots autorisés en grants opaques, limités au projet, aux imports ou aux destinations. Le domaine résout des IDs, jamais un chemin arbitraire fourni par Solid.
- Le profil programmable peut importer depuis des roots configurés et exporter vers une destination configurée, avec canonicalisation, contrôle de traversal/symlinks et limite de taille. Une grant révoquée est refusée.
- Exporter crée un nouveau fichier ; remplacer une destination existante nécessite une opération distincte explicitement autorisée.

### Surface MCP

Premier transport : processus local stdio, adapté au lancement par un client. La [spécification des transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports) définit stdio et Streamable HTTP ; ce dernier pourra être un adaptateur séparé si un besoin distant apparaît.

Figer au P0 le SDK et la révision MCP effectivement supportés, puis appliquer leur cycle de vie, métadonnées, annulation et capacités ; ne pas recopier des détails d’une ancienne révision dans le serveur.

| Outil MCP | Rôle |
| --- | --- |
| beam_capabilities / beam_effect_definitions | Découvrir les opérations, définitions et paramètres réellement disponibles |
| beam_projects_list / beam_project_create / beam_project_open / beam_project_get / beam_sequence_get | Trouver/créer/ouvrir un projet autorisé et lire une projection ou plage |
| beam_assets_list / beam_asset_import / beam_asset_relink | Sources paginées, import et nouvelle version via grant |
| beam_suggestions_get / beam_presets_list | Lire l’analyse source et les presets du catalogue |
| beam_extension_validate / beam_extension_register | Vérifier/enregistrer un pack local autorisé, avec version et hash |
| beam_transaction_validate / beam_transaction_apply | Diagnostics sans mutation, puis commandes atomiques |
| beam_history_undo / beam_history_redo | Annulation au scope explicite |
| beam_transport_get / beam_transport_control | Play/pause/seek et qualité, indépendamment de l’historique |
| beam_preview_render | Demander un artefact de preview borné à un temps précis |
| beam_export_start / beam_job_get / beam_job_cancel | Jobs réels, progression et annulation |

Les tools exposent des schémas d’entrée/sortie et des résultats structurés, selon la [spécification Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools). Les erreurs métier conservent leur code et contexte dans le résultat.

Des [resources MCP](https://modelcontextprotocol.io/specification/2026-07-28/server/resources) permettent de consulter catalogue, snapshot révisionné et artefacts via URI opaque de projet. La diffusion des changements utilise les capacités de souscription de la révision supportée ; la lecture explicite jobs.get reste disponible.

Un job long rend vite son jobId puis expose progression/résultat/annulation ; la perte d’une connexion ne rejoue pas un commit et ne confond pas annulation RPC et annulation du job. Les autorisations sont contrôlées par le host/grant ; les annotations MCP ne remplacent pas ces contrôles.

Parcours automatisé obligatoire : découvrir la définition zoom, créer une séquence, importer une source autorisée, appliquer un batch clip/zoom/filtre, ajouter une transition, rendre une frame, annuler/rétablir, exporter et relire le document sauvegardé. Tester ce parcours sans piloter l’UI.

## 12. Migration et persistance

Introduire une version documentaire V2 distincte de la version d’API et des versions d’effets. Garder un lecteur V1 dédié à la migration, puis un unique modèle actif V2 ; aucun double chemin de rendu permanent.

Le lot P1 valide le modèle et la migration des décisions en mémoire. Activer la publication V2 seulement lorsque son compilateur et les zooms passent l’équivalence au P5/P6, puis le parcours complet au P11 ; aucun document ne doit devenir inutilisable entre deux lots. La comparaison d’image utilise la preview Full et la frame de composition avant encodage, à temps/espace couleur identiques ; la compression d’un export n’est pas une preuve d’inégalité du graphe.

Migration :

1. Lire/valider sans écrire et préserver le fichier original/recovery.
2. Normaliser les séquences V1 et l’état actif sans perdre un historique indépendant.
3. Convertir cadrage, couleur, opacité/gain et fondus en instances avec un ordre reproduisant V1.
4. Convertir les zooms actifs en instances propres à chaque occurrence, ancrées en temps source et bornées par la fenêtre du clip ; garder leur mouvement exact. Les suggestions non appliquées restent dans les métadonnées.
5. Migrer aussi les snapshots undo/redo, avec IDs reproductibles dans une même lignée d’instance et sans réintroduire la télémétrie dans l’historique.
6. Vérifier équivalence de temps, caméra, alpha/gain et image sur fixtures, avant publication atomique.
7. Sauvegarder le V2 et son checkpoint seulement après validation ; une panne laisse le V1 ou le dernier V2 valide récupérable.

Rejeter une version de document future sans l’écraser. Un format V2 valide avec pack absent peut être inspecté et conserve ses instances ; son rendu indisponible est annoncé, sans supprimer le pack ou convertir silencieusement son effet.

Garder la borne de 50 états actuelle et ajouter un budget en octets. Les états référencent les blocs immuables nécessaires ; ils ne sont pas chacun une copie intégrale du montage. Mutualiser les données immuables et les projections pour éviter les copies de médias/télémétrie dans le chemin d’édition. Les reçus d’idempotence et jobs persistants ont leur propre rétention.

## 13. Lots d’exécution et dépendances

Tous les lots ci-dessous font partie du périmètre. Une gate ferme un lot ; elle n’autorise pas à abandonner les lots suivants. Les durées seront estimées après le baseline, sans inventer une date de livraison.

| Lot | Dépendances | Livrable et gate |
| --- | --- | --- |
| P0 — Contrats et baseline | — | ADR temps, transition, historique, schémas/MCP ; fixtures, métriques et limites reproductibles |
| P1 — Document V2 et migration | P0 | Sources intactes, séquences indépendantes, migration en mémoire de tous les historiques et recovery |
| P2 — Commandes/requêtes | P1 | Batch atomique, dry-run, révisions, idempotence, erreurs et édition headless testés |
| P3 — Timing/animation | P1, P2 | Mapping commun, courbes seek-safe et opérations trim/split/duplicate exactes |
| P4 — Catalogue et instances | P2, P3 | Définitions typées, pile, presets et paramètres partagés ; filtres V1 conservés |
| P5 — Rendu ciblé | P3, P4 | Paramètres sans reconstruction, cibles clip/piste/séquence déclarées réellement traitées, dernière frame conservée |
| P6 — Zooms et curseur | P3–P5 | Zooms éditables, overlay curseur, style hérité/overrides et historique par clip/séquence |
| P7 — Timeline/inspecteur | P4–P6 | Régions et formulaires communs, gestes natifs, responsive et keyboard validés |
| P8 — Transitions réelles | P3–P5, P7 | Crossfade vidéo/audio à deux entrées, poignées et montage aux bornes testés |
| P9 — Extensions/shaders | P4, P5, P8 | Pack externe réel : un effet et une transition sans modification des composants génériques |
| P10 — SDK/CLI/MCP | P2–P9 | Adaptateurs minces, grants, propriétaire unique et parcours complet headless |
| P11 — Validation finale | P1–P10 | Équivalence preview/export, budgets, qualité, documentation et changelog |

### Tickets vérifiables par lot

- P0.1 inventorier commandes et frontières ; P0.2 figer les ADR ; P0.3 capturer fixtures V1 et baseline decode/commit/present ; P0.4 tester la génération de contrats.
- P1.1 types V2 ; P1.2 lecteur/migration V1 et historique ; P1.3 persistence/checkpoint/recovery/verrou ; P1.4 source identity et indépendance des séquences.
- P2.1 handlers de commandes ; P2.2 validation/batch et références de résultats ; P2.3 reçus de commit/conflits ; P2.4 projections/événements et host headless.
- P3.1 temps rationnel et intersections ; P3.2 bindings/courbes ; P3.3 mappings trim/split/duplication ; P3.4 contrôles caméra déterministes.
- P4.1 catalogue/descripteurs ; P4.2 instances/piles ; P4.3 presets couleur/fondus/cadrage/gain ; P4.4 génération schémas et tests de compatibilité de version.
- P5.1 RenderPlan/ChangeSet ; P5.2 nœuds et bindings stables ; P5.3 préparation/swap et erreurs ; P5.4 instrumentation, cache et lifecycle GPU.
- P6.1 analyse/suggestions source ; P6.2 instanciation et commandes zoom ; P6.3 cible, suivi, entry/exit et interpolation ; P6.4 fixtures seek/coupes/undo.
- P7.1 projection et composants timeline ; P7.2 gestes/selection/snapping ; P7.3 inspecteur et contrôles de cible ; P7.4 narrow panels/tooltips/segmented/accessibilité.
- P8.1 modèle/validation des poignées ; P8.2 compilation deux entrées ; P8.3 présentation/édition ; P8.4 synchronisation vidéo/audio et migration des fondus simples.
- P9.1 manifestes/version/hash ; P9.2 chargement et compilation GL ; P9.3 effet et transition de démonstration sur médias réels ; P9.4 pack absent/erreur/budgets.
- P10.1 client généré/CLI ; P10.2 connexion au writer et grants ; P10.3 tools/resources/jobs MCP ; P10.4 scripts d’exemples exécutés et parcours automatisé.
- P11.1 matrice complète et profils ; P11.2 audit complexité ; P11.3 docs/skill/changelog ; P11.4 revue finale des diffs et limitations de plateforme.
- P0.5 stockage paginé, index et budgets de croissance ; P1.5 blocs immuables/checkpoints et historiques partagés ; P5.5 fenêtre active du rendu et surfaces réutilisées.
- P6.5 module curseur, profils et mapping partagé ; P7.5 piles FX et régions virtualisées ; P11.5 scénarios 10 000 clips/100 FX et profils à tailles croissantes.

## 14. Validation, performance et qualité du code

Chaque lot possède des tests ciblés dans la couche utile. Aucun test ne remplace simplement le code sous une autre forme : vérifier les invariants, erreurs et bornes observables.

| Domaine | Preuves requises |
| --- | --- |
| Non destructif | Hashs source avant/après edits, undo, migration et export ; dérivés séparés |
| Modèle | IDs/references, limites, NaN/infini, objets invalides, sources absentes, limites temporelles |
| Transactions | Batch partiellement invalide, conflit UI/MCP, retry après réponse perdue, crash et écriture refusée |
| Séquences | Même source dans deux montages, zoom distinct, undo indépendant, suppression/restauration |
| Temps | Fractional fps, ticks exacts, fin exclusive, trims récupérables, splits et interpolation aux bornes |
| Rendu | Même frame/temps en preview/export ; ordre des effets, alpha, couleur et mix audio contrôlés |
| Invalidation | Identité des nœuds/décodeurs conservée sur paramètre ; aucune reconstruction sur sélection/panel |
| Zoom | Sans curseur, centre fixe/suivi, entry/exit, gap entre zooms, seek hors ordre, coupe dans la courbe |
| Transitions | Deux sources réelles, cut aux bornes, poignées insuffisantes, overlaps invalides, audio sans saut |
| Extensions | Version/hash, schéma invalide, shader rejeté, pack manquant, backend indisponible, libération |
| UI | Bundle Solid réellement monté, light/dark, tailles étroites, keyboard, iconOnly et tooltip |
| Médias longs | Source de 40 minutes : demandes de viewport bornées, aucune extraction intégrale des thumbnails/PCM |
| Croissance | 10 000 clips, 100 FX sur un clip, répétition/ordre/bypass du même type et coûts proportionnés à la fenêtre active |
| Curseur | Profil commun/overrides, données absentes/incrustées, clics/lissage/auto-hide, coupe et zoom synchronisés |
| MCP/CLI | Contrats réels, pagination, grants/révocation, propriétaire déjà ouvert, job cancel et retour structuré |

Baseline et budgets : publier P0 machine/GPU, source/canvas, nombres de clips/effets et percentiles. Budget de présentation visé : 16,7 ms à 60 Hz ; mesurer indépendamment les délais decode/seek et la latence d’édition. Le commit de paramètres ne doit pas changer l’identité du pipeline/décodeur lorsque le backend permet l’update. Les mouvements natifs de panel ne délivrent aucun événement JS intermédiaire. Caches, queues, tailles de documents/batches et compilation ont des limites explicites.

Les tests sans fenêtre vérifient layout retenu, nombre de callbacks, source seeks, GL, preview et export lorsque la machine le permet. Ils ne prouvent pas la latence live du bureau. Ne pas ouvrir de fenêtre visible sans demande utilisateur ; documenter séparément les validations matérielles et Windows/macOS indisponibles.

Qualité de code :

- Moins de 500 lignes par source, types dans des fichiers dédiés, fonctions nommées avec une responsabilité et effets de bord aux frontières.
- Aucun any nouveau, protocole non typé, duplication de validation par transport ou switch métier croissant dans l’inspecteur/timeline.
- Built-ins et backends séparés du catalogue ; dispatch vers handlers spécialisés plutôt qu’un interpréteur universel.
- Auditer la complexité par fonction, y compris editor-engine absent de l’audit précédent. Une fonction complexe doit être revue ; extraire seulement à une frontière métier réelle.
- Tests Rust dans le miroir test/, succès/échec/bornes, Nextest ciblé et Clippy des packages concernés.
- Vitest ciblé et check/build des frontières typées modifiées. Seuils du dépôt maintenus : TS 90 % des quatre métriques, Rust 85 % lignes par crate et workspace.
- Pas de suite globale à chaque lot. La gate finale de cette refonte transversale justifie une couverture workspace, annoncée avant exécution ; réutiliser le target partagé et le script de couverture du dépôt.

## 15. Définition de terminé

- [ ] Les six axes sont livrés, y compris transitions à deux entrées et mise à jour ciblée du rendu.
- [ ] Les zooms sont des régions visibles, éditables et paramétrables, accessibles aussi par commandes.
- [ ] Aucun plafond fonctionnel arbitraire de clips/FX ; plusieurs instances d’un même type se cumulent sur un clip.
- [ ] Le curseur conserve un parcours simple avec style commun, overrides par enregistrement et régions/animations avancées.
- [ ] Les projets V1 et leurs historiques migrent sans altérer les sources ni leur résultat.
- [ ] Les séquences restent indépendantes et tous les gestes de contenu sont annulables après réouverture.
- [ ] Un nouveau pack effet/transition utilise les composants communs sans modifier leur code.
- [ ] SDK, CLI et MCP réalisent le parcours complet sur de vrais médias sans fenêtre.
- [ ] Preview/export évaluent le même snapshot, les mêmes courbes et l’ordre défini.
- [ ] UI responsive et visuels source restent immédiats, bornés et sans boucle JS au repos.
- [ ] Échecs de sauvegarde/rendu/pack et conflits sont visibles, récupérables et testés.
- [ ] Vérifications ciblées, gate transversale finale et limites de plateforme sont documentées.
- [ ] Guides architecture/API, exemples exécutables et notes de diagnostic sont à jour.
- [ ] Les pièges ARGUI réellement constatés/corrigés sont ajoutés au skill commun avec preuve de régression.
- [ ] Chaque lot modifiant le comportement contient son entrée CHANGELOG.md sous Unreleased.

Les lots sont considérés complets uniquement avec leur code intégré, les validations finales du responsable et leurs notes de livraison. Une preuve locale Linux ne valide pas les chemins Windows ou macOS.
