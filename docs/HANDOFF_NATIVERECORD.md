# Handoff Native Recorder

Date du checkpoint : 2 août 2026

Cette branche (`full-native-refactor`) est un point de reprise pour le recorder entièrement natif prévu pour la v0.2.0. La priorité immédiate reste de pouvoir shipper la version actuelle sur Windows avec les limites décrites ci-dessous. Ce document décrit donc l’état réel du code, et ne doit pas être lu comme une validation hardware complète.

## État synthétique

| Piste / fonctionnalité | Windows | macOS | État du checkpoint |
| --- | --- | --- | --- |
| Écran / fenêtre | Native Windows Graphics Capture | ScreenCaptureKit | Implémenté dans le pipeline natif |
| Curseur | Win32 | CoreGraphics | Implémenté dans le pipeline natif |
| Microphone | CPAL / WASAPI | CPAL / CoreAudio | Câblage natif réalisé ; test avec périphérique réel à refaire |
| Audio système | CPAL tente l’endpoint render/output | Câblage CPAL présent, ScreenCaptureKit reste la cible | **Non validé ; Windows ne détecte actuellement aucune source chez l’utilisateur** |
| Webcam : découverte | Nokhwa / Media Foundation | Nokhwa / AVFoundation | Implémenté |
| Webcam : prévisualisation | Nokhwa + stream Rust localhost | Nokhwa + stream Rust localhost, non validé ici | Implémenté côté code ; validation visuelle à faire |
| Webcam : enregistrement | Writer natif Windows + H.264 | Writer absent | Windows à tester ; macOS manquant |
| Linux | Métadonnées / permissions uniquement | — | Hors scope de ce checkpoint |

## Ce qui est livré

- Rust possède la capture, la coordination de session, les queues bornées, les writers WAV et les sorties natives. Electron ne transporte plus de frames et ne lance plus les anciens sidecars Chromium pour la caméra, le micro ou l’audio système.
- La caméra Windows utilise Nokhwa pour l’acquisition et le writer natif Windows pour l’encodage H.264. La prévisualisation est aussi produite par Rust : un serveur localhost expose un flux multipart BMP que l’UI affiche dans une balise image.
- La prévisualisation et l’enregistrement réutilisent le même chemin d’acquisition lorsque la session démarre. Cela évite d’ouvrir deux fois la webcam et de faire concourir deux lecteurs sur le même périphérique.
- Le serveur de preview utilise une file bornée de taille 2, encode les BMP hors du thread d’acquisition et réduit la preview à une largeur maximale de 640 pixels. Les frames trop anciennes sont abandonnées plutôt que d’accumuler de la latence.
- La caméra ne demande plus systématiquement le mode Nokhwa `AbsoluteHighestResolution`. Elle demande en priorité `1280x720`, MJPEG, 30 FPS, puis utilise le fallback Nokhwa si ce format n’est pas exposé par la webcam.
- Le protocole Electron/Rust expose maintenant `preview-start` et `preview-stop`. L’overlay caméra recharge le flux natif après l’arrêt d’un enregistrement.
- Les erreurs de piste optionnelle sont explicites : aucun fichier vide n’est présenté comme une piste valide.

## Pourquoi la webcam était autour de 12 FPS

La configuration précédente utilisait `RequestedFormatType::AbsoluteHighestResolution`. Selon la documentation Nokhwa, ce mode choisit d’abord la résolution la plus élevée, puis le meilleur FPS disponible pour cette résolution. Une webcam qui expose, par exemple, une résolution haute seulement à 12 FPS négocie donc naturellement 12 FPS.

La configuration actuelle utilise `RequestedFormatType::Closest(CameraFormat::new_from(1280, 720, FrameFormat::MJPEG, 30))`. Nokhwa cherche alors le format le plus proche dans l’ordre du format de frame, de la résolution et du FPS. Le fallback `None` laisse le backend choisir un format si le MJPEG 720p n’existe pas.

Référence consultée : [documentation Nokhwa de `RequestedFormatType`](https://docs.rs/nokhwa/latest/nokhwa/utils/enum.RequestedFormatType.html). La négociation exacte dépend toujours des modes réellement exposés par la webcam ; il faut donc relever le format obtenu sur le matériel avant de promettre 30 FPS.

## Blocages connus

### 1. Audio système Windows : non fonctionnel dans le test utilisateur

Le code catalogue les périphériques CPAL et tente d’exposer l’audio système depuis les périphériques output/render (`system-audio:cpal:*`). L’ouverture de la piste utilise ensuite la configuration output et la capture d’entrée du périphérique, conformément à l’intention du loopback WASAPI.

Cependant, dans le test utilisateur, aucun périphérique d’audio système n’est détecté/listé sous Windows. Cette piste ne doit donc pas être annoncée comme fonctionnelle ni validée pour le ship. Il faut reprendre ce point sur une machine Windows réelle : inspecter les endpoints WASAPI render, vérifier le mode loopback CPAL, les périphériques désactivés et les changements de version CPAL. Si CPAL ne permet pas d’obtenir un endpoint loopback fiable, ajouter un petit adaptateur WASAPI direct plutôt que de modifier le pipeline générique.

### 2. Enregistrement caméra macOS manquant

La découverte et la preview caméra macOS sont préparées avec Nokhwa/AVFoundation, mais `MacCameraRecording::start` renvoie encore explicitement `macOS camera encoding is unavailable in this build`. Il faut ajouter un writer AVFoundation/VideoToolbox (ou un équivalent natif compatible avec le format de session) avant de considérer la caméra macOS comme livrée.

### 3. Validation macOS impossible depuis cet environnement

Le build/clippy macOS n’a pas pu être exécuté ici car l’environnement ne possède pas le SDK Apple/Xcode nécessaire. Les chemins macOS doivent être compilés et testés sur un Mac, notamment la preview Nokhwa, les permissions caméra/micro/screen recording et l’audio système.

### 4. Microphone et audio macOS

Le câblage audio commun CPAL existe pour le microphone et l’audio système, mais il reste à vérifier avec du matériel réel. Pour la version complète, l’audio système macOS devrait être rapproché de ScreenCaptureKit afin de partager le mécanisme et les timestamps de la capture écran.

### 5. La télémétrie de niveau micro n’est pas encore entièrement native

La capture et l’enregistrement du micro sont natifs. En revanche, le vumètre d’interface conserve encore un appel browser `getUserMedia` pour mesurer le niveau en direct. La preview caméra, elle, n’utilise plus `getUserMedia` : elle affiche le flux localhost généré par Rust.

### 6. Vérification frontend

`npm run build` est bloqué par un problème d’outillage déjà présent : la version installée de `vue-tsc` cherche `typescript/lib/tsc`, alors que TypeScript 7 n’expose plus ce chemin via les exports du package. La vérification équivalente `tsc -b` suivie de `vite build` passe.

La suite Vitest complète contient aussi des échecs sans rapport avec le recorder natif : une attente de taille de police du téléprompteur et deux attentes de structure de l’overlay de sélection de région. Les tests ciblés du recorder et de la preview passent.

## Vérifications réalisées

Les vérifications suivantes ont été exécutées avant ce handoff :

- `cargo fmt --all --check`
- `cargo test --workspace --all-features -q` — 33 tests passés, 1 ignoré
- `cargo clippy -p capture --target x86_64-pc-windows-msvc --all-features -- -D warnings`
- `cargo build -p capture --bin capture-engine --release` pour Windows
- `npm run typecheck`
- `npx tsc -b` puis `npx vite build`
- `npm test` — tests CJS passés
- Vitest ciblé sur `CameraPreviewOverlay`, le HUD et le contrôleur d’enregistrement

Ces résultats ne remplacent pas le test visuel demandé sur une webcam Windows ni le test hardware macOS.

## Reprise pour la v0.2.0

1. Reproduire le catalogue audio Windows avec un périphérique de sortie actif et journaliser chaque endpoint render CPAL/WASAPI.
2. Corriger la sélection loopback et ajouter un test hardware/smoke Windows qui vérifie qu’un WAV système contient réellement des samples.
3. Ajouter le writer caméra macOS avec une piste optionnelle propre et une validation PTS/durée.
4. Tester la négociation Nokhwa sur plusieurs webcams et journaliser résolution, format et FPS effectivement obtenus.
5. Déplacer le vumètre micro vers une métrique native si l’objectif devient « full native » jusque dans l’UI.
6. Rejouer les checks Rust et frontend sur Windows réel, puis compiler/tester l’ensemble sur macOS.

## Commandes de reprise

Depuis le dépôt :

```bash
git switch full-native-refactor
git log --oneline --decorate -5
```

Dans WSL, les commandes `cargo` et `npm` doivent être lancées via PowerShell conformément aux instructions du dépôt. Le document de conception complet reste [nativeRecorder.md](nativeRecorder.md) et les contraintes d’architecture sont dans [packages/capture/ARCHITECTURE.md](../packages/capture/ARCHITECTURE.md).
