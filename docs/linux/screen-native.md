# Capture d'ecran native Linux avec Portal et PipeWire

Statut : implementation produit terminee ; validation materielle Portal interactive a executer manuellement.

Ce document decrit l'implementation Linux de capture d'ecran du depot. Elle cible d'abord Fedora sous Wayland, puis les distributions Linux modernes qui fournissent un portail ScreenCast conforme, PipeWire et FFmpeg.

## Decision

Le backend Linux sera implemente dans le moteur Rust de Beam avec :

- XDG Desktop Portal ScreenCast pour demander a l'utilisateur une source autorisee ;
- `ashpd` 0.13 pour le protocole Portal ;
- `pipewire` 0.10 et SPA pour recevoir l'image et les metadonnees du meme buffer ;
- `MetaHeader` pour le timestamp natif ;
- `MetaCursor` pour `cursor.id`, `cursor.x` et `cursor.y` ;
- un helper `beam-input-helper` limite aux boutons et raccourcis filtres, autorise par Polkit ;
- un chemin memoire CPU possede par Rust, sans `wgpu` ;
- une interface interne neutre qui transmet un echantillon atomique au moteur existant.
- un processus FFmpeg externe controle par Rust, avec H.264 (`libx264` ou `libopenh264`) et muxage MP4 atomique.

Le backend ne contiendra aucun code specifique a Fedora, GNOME, KDE ou wlroots. Fedora GNOME Wayland est la premiere plateforme de validation, pas une dependance d'architecture.

Linux est un backend natif frere de Windows et macOS. Il passe obligatoirement par la meme facade `screen`, le meme `RecordingSession`, le meme `ActiveRecordings` et le meme protocole JSONL. Il n'existe ni moteur Linux parallele, ni protocole Linux, ni capture geree par Electron.

Le chemin nominal est :

```text
Electron prepare
  -> capture-engine JSONL
  -> XDG ScreenCast Portal
  -> PipeWire remote fd
  -> PipeWire video buffer
       + SPA MetaHeader
       + SPA MetaCursor
  -> OwnedScreenSample { frame, timestamp, cursor }
  -> entree bornee du moteur Rust
```

## Contrat plateforme commun — non negociable

L'organisation reste symetrique :

```text
packages/capture/src/screen/
  mod.rs                    facade commune utilisee par la session
  frame.rs                  contrats neutres du domaine screen
  win/                      backend Windows Graphics Capture
  mac/                      backend ScreenCaptureKit
  linux/                    backend XDG Portal + PipeWire
```

Le reste du moteur ne doit pas connaitre `ashpd`, PipeWire, SPA ou le detail du picker. Il manipule seulement la facade commune et un handle de recording plateforme.

La surface attendue est conceptuellement la meme pour les trois backends :

```rust
pub struct ScreenOpenRequest<'a> {
    pub selection: &'a ScreenSelection,
    pub recording: &'a RecordingSettings,
    pub region: Option<ScreenRegion>,
    pub cursor: CursorSelection,
    pub start_ns: u64,
    pub start_gate: Arc<StartGate>,
}

pub trait NativeScreenRecording {
    fn metrics(&self) -> ScreenCaptureMetrics;
    fn stop(&mut self) -> Result<(), CaptureError>;
}
```

Les noms exacts seront fixes pendant LNX-00. Le point important est qu'il n'y ait qu'un appel plateforme commun depuis `ActiveRecordings`. Windows, macOS et Linux adaptent leurs details derriere cette facade. Les differences Portal — preparation interactive et connexion conservee pendant pause — sont des details prives de `screen/linux/`, pas une nouvelle API de session.

Les commandes restent exactement :

```text
discover -> prepare -> start -> pause -> resume -> stop
                              \-> cancel/discard/status
```

Le renderer et Electron ne choisissent jamais une implementation native. Ils envoient la meme intention typee qu'aujourd'hui ; Rust selectionne son backend par `cfg(target_os)` dans la facade `screen`.

## Limite explicite du perimetre

`ashpd` et `pipewire` fournissent des buffers video bruts et leurs metadonnees. Ils ne produisent ni MP4, ni H.264, ni segment finalise.

Beam possede maintenant l'interface generique `ScreenSampleSink` recevant les frames brutes. Sous Linux, le sink produit lance FFmpeg directement, lui transmet les frames BGRA par stdin, draine stderr, attend sa terminaison et ne publie le segment qu'apres une sortie reussie et non vide. Le choix FFmpeg est explicite et constitue une dependance runtime, pas une crate Rust ni une seconde voie de capture.

Deux gates sont volontairement distincts :

1. **Capture native** : le moteur recoit de vrais echantillons image/timestamp/curseur, avec cycle de vie, erreurs et metriques.
2. **Enregistrement produit** : le sink FFmpeg transforme ces echantillons en segments MP4 lisibles respectant le manifeste Beam.

Les deux chemins sont raccordes. La matrice materielle interactive reste volontairement manuelle : elle ne peut pas etre remplacee par un test CI sans consentement Portal.

## Perimetre fonctionnel

Inclus :

- session Linux utilisant le portail ScreenCast ;
- selection d'un moniteur ou d'une fenetre par le picker systeme ;
- un seul stream par session dans le premier increment ;
- negotiation obligatoire de `CursorMode::Metadata` pour le mode curseur separe ;
- buffers video raw CPU, timestamp, identite et position du curseur ;
- pause/reprise sans rouvrir le picker ;
- arret, annulation, fermeture distante et deconnexion explicites ;
- metriques, diagnostics et erreurs stables ;
- branchement au protocole et au cycle de session Rust existants ;
- instructions de compilation et d'execution pour les distributions modernes.
- clics gauche, droit, milieu et boutons lateraux dans `input.json` ;
- raccourcis structures comme `Ctrl+W`, sans texte saisi ni donnees IME ;

Exclus :

- capture directe avec une API privee de GNOME, KWin ou wlroots ;
- acces arbitraire au bureau Wayland sans consentement Portal ;
- X11 direct ; un environnement X11 peut fonctionner uniquement si son portail ScreenCast est conforme ;
- capture audio, microphone et camera ;
- texte tape, mots de passe, composition IME et frappes imprimables sans modificateur ;
- interpretation semantique de la forme du curseur ; son identifiant est opaque ;
- persistance du bitmap du curseur ;
- support opportuniste d'un DMA-BUF non mappable ;
- fallback silencieux vers un curseur embarque ;
- capture ou encodage silencieux sans verification des capacites runtime.

## Dependances Rust

Les dependances natives restent limitees a Linux afin de ne pas contaminer les builds Windows et macOS :

```toml
[target.'cfg(target_os = "linux")'.dependencies]
ashpd = {
    version = "0.13",
    default-features = false,
    features = ["tokio", "screencast"]
}
pipewire = "0.10"
evdev = "0.13.2"
tokio = {
    version = "1",
    features = ["rt-multi-thread", "macros"]
}
```

`serde` et `serde_json` sont deja des dependances communes de `capture` et ne doivent pas etre dupliquees. `anyhow` n'est pas ajoute a la bibliotheque : le depot impose des erreurs de domaine et possede deja `CaptureError`. Il peut etre utilise dans un exemple autonome uniquement si cet exemple ne traverse aucun contrat public.

Ne pas activer la feature `ashpd/pipewire`. Dans `ashpd` 0.13.13, elle cible encore une autre ligne de version des bindings. Le fd retourne par `ashpd` doit etre transmis directement a `pipewire` 0.10 avec `Context::connect_fd`.

Versions de reference au moment du plan :

- `ashpd` 0.13.13, MSRV 1.87 ;
- `pipewire`, `libspa` et bindings systeme 0.10.0, MSRV 1.80 ;
- toolchain du depot : Rust stable, donc au moins 1.87 pour cette combinaison.

Le lockfile doit pinner la resolution effectivement validee. Une mise a jour mineure de ces crates repasse les tests deterministes et les tests materiels Linux.

### Runtime FFmpeg

FFmpeg est lance comme processus enfant direct, sans shell. Beam cherche `ffmpeg` dans `PATH`, ou utilise le chemin explicite de `BEAM_FFMPEG_PATH`. Avant tout picker, le probe exige :

- une sortie de version FFmpeg valide ;
- le muxeur `mp4` ;
- `libx264` en priorite, sinon `libopenh264`.

Il n'existe aucun fallback silencieux vers MPEG-4 Part 2 ni vers un encodeur materiel dependant de la machine. Les frames BGRA compactes sont transmises sur stdin ; stderr est draine sur un thread borne. Les arguments imposent H.264, YUV420, le bitrate, la cadence cible, l'intervalle de keyframes, des timestamps d'arrivee wall-clock et une sortie VFR. Le manifeste conserve la timeline native Beam ; FFmpeg produit la timeline media du segment a partir de l'arrivee ordonnee des echantillons.

## Installation

### Fedora Workstation / GNOME

Dependances de compilation :

```bash
sudo dnf install gcc clang-devel pkgconf-pkg-config pipewire-devel
```

Runtime et outils de diagnostic :

```bash
sudo dnf install ffmpeg-free pipewire pipewire-utils wireplumber xdg-desktop-portal xdg-desktop-portal-gnome
```

Sur KDE, remplacer le backend GNOME par `xdg-desktop-portal-kde`. Sur un bureau wlroots, installer le backend Portal recommande par ce bureau, par exemple `xdg-desktop-portal-wlr` lorsqu'il est approprie. Ne pas conseiller plusieurs backends concurrents sans configuration explicite.

### Debian / Ubuntu

Dependances de compilation :

```bash
sudo apt install build-essential clang libclang-dev pkg-config libpipewire-0.3-dev
```

Runtime : installer FFmpeg, PipeWire, WirePlumber, `xdg-desktop-portal` et exactement le backend du bureau utilise. Les noms varient selon la version de la distribution ; le paquet GNOME est generalement `xdg-desktop-portal-gnome`, celui de KDE `xdg-desktop-portal-kde`.

### Arch Linux

```bash
sudo pacman -S --needed base-devel clang ffmpeg pkgconf pipewire wireplumber xdg-desktop-portal
```

Ajouter ensuite le backend Portal correspondant au bureau, par exemple `xdg-desktop-portal-gnome`, `xdg-desktop-portal-kde` ou `xdg-desktop-portal-wlr`.

Les paquets `-devel` ou `-dev` sont requis uniquement pour compiler. Le paquet Beam devra declarer ses dependances runtime a `libpipewire-0.3`, PipeWire et au portail ; il ne doit pas embarquer arbitrairement le backend d'un bureau particulier.

### Acces aux interactions

Le Portal ne fournit pas les boutons de souris ni les raccourcis clavier. Beam les recupere donc avec un helper Rust separe. Le processus Electron et le renderer n'obtiennent jamais de descripteur `/dev/input` et ne recoivent jamais de frappes brutes.

Le helper applique une liste fermee avant toute sortie :

- les boutons deviennent des evenements structures avec timestamp ;
- les lettres, chiffres et espace sont ignores sans `Control`, `Alt` ou `Meta` ;
- les fleches, touches de navigation et touches de fonction restent des tokens, pas du texte ;
- les repetitions, caracteres Unicode et donnees de composition sont ignores.

RPM et DEB installent le binaire root-owned dans `/usr/libexec/beam-input-helper` et sa policy Polkit dans `/usr/share/polkit-1/actions`. Une AppImage affiche une demande Polkit explicite depuis les preferences et installe exactement ces deux fichiers dans des chemins fixes. Aucun paquet Flatpak, groupe `input`, regle udev permissive ni commande terminal n'est necessaire.

L'autorisation est disponible uniquement dans `HUD > Preferences > Enregistrer les raccourcis clavier`. Le HUD principal n'affiche aucune demande et ne change pas de taille. Sous Linux, desactiver ce reglage coupe a la fois les raccourcis et les metadonnees de clics. Le sidecar commun est `cursor/input.json`. Les clics sont aussi fusionnes dans `cursor/cursor.json` avec la derniere position PipeWire connue afin de conserver les effets de clic et le zoom automatique existants.

Windows et macOS produisent le meme `input.json` depuis leurs APIs natives. Sur ces deux plateformes, desactiver le reglage coupe uniquement les raccourcis et conserve les clics. macOS affiche la demande systeme Input Monitoring uniquement apres l'action explicite d'autorisation dans les preferences ; Windows n'exige pas de helper privilegie.

### Diagnostic local

Avant de conclure a un bug Beam :

```bash
echo "$XDG_SESSION_TYPE"
systemctl --user status pipewire wireplumber xdg-desktop-portal
busctl --user introspect \
  org.freedesktop.portal.Desktop \
  /org/freedesktop/portal/desktop \
  org.freedesktop.portal.ScreenCast
pw-cli info 0
```

Le resultat attendu pour la cible principale est une session `wayland`, des services actifs, une interface ScreenCast disponible et un daemon PipeWire joignable. Une variable `WAYLAND_DISPLAY` seule n'est jamais une preuve de capacite.

## Contrat interne du moteur

Ajouter un type neutre, sans aucun type `ashpd`, PipeWire ou SPA :

```rust
pub struct OwnedScreenSample {
    pub frame: OwnedVideoFrame,
    pub timestamp: FrameTimestamp,
    pub sequence: u64,
    pub cursor: CursorSampleState,
}

pub struct OwnedVideoFrame {
    pub width: u32,
    pub height: u32,
    pub stride: usize,
    pub pixel_format: PixelFormat,
    pub pixels: Arc<[u8]>,
}

pub struct FrameTimestamp {
    pub session_ns: u64,
    pub native_pts_ns: Option<u64>,
    pub source: TimestampSource,
}

pub enum CursorSampleState {
    Unknown,
    Known {
        native_cursor_id: String,
        pixel_x: i32,
        pixel_y: i32,
        normalized_x: f64,
        normalized_y: f64,
        visible: bool,
        hotspot: Option<Hotspot>,
    },
}
```

Les noms definitifs peuvent evoluer, mais les invariants ne changent pas :

- l'image et le curseur d'un buffer partagent exactement le meme `session_ns` ;
- l'echantillon ne contient aucune reference vers un buffer PipeWire restitue ;
- les coordonnees pixels restent signees et ne sont jamais clampees silencieusement ;
- les coordonnees normalisees sont calculees avec les dimensions video negociees, pas avec la taille logique renvoyee par le Portal ;
- une metadonnee absente produit `Unknown`, jamais `(0, 0)` ;
- aucun clic ou nom de curseur n'est fabrique ;
- les donnees natives ne franchissent pas la frontiere JSONL ni Electron.

Introduire une petite interface de consommation appartenant au domaine `screen`, par exemple :

```rust
pub trait ScreenSampleSink: Send {
    fn format_changed(&mut self, format: VideoFormat) -> Result<(), CaptureError>;
    fn push(&mut self, sample: OwnedScreenSample) -> Result<(), CaptureError>;
    fn discontinuity(&mut self, event: ScreenDiscontinuity) -> Result<(), CaptureError>;
    fn finish(&mut self) -> Result<(), CaptureError>;
}
```

Le backend Linux depend de cette interface ; l'interface ne depend jamais de Linux. Un sink de test collecte les echantillons en memoire. Le sink produit du moteur sera un choix explicite du gate d'enregistrement produit.

## Organisation cible

```text
packages/capture/src/screen/
  mod.rs                   facade plateforme commune
  frame.rs                 types et sink neutres
  recording.rs             requete/handle/metriques communs
  win/                     implementation Windows existante
  mac/                     implementation macOS existante
  linux/
    mod.rs                 facade Linux
    capabilities.rs        probe Portal/PipeWire
    portal.rs              cycle de vie ScreenCast
    prepared.rs            session autorisee et stream negocie
    recording.rs           start/pause/resume/stop
    metrics.rs             compteurs atomiques
    pipewire/
      mod.rs
      thread.rs            MainLoop et commandes bornees
      format.rs            POD SPA et formats raw
      buffer.rs            validation/copie du payload
      metadata.rs          Header/Crop/Transform/Cursor
      cursor_state.rs      machine d'etat MetaCursor
      timestamp.rs         ancrage vers la session Beam
```

Chaque fichier de production reste sous 500 lignes. Les imports `ashpd::`, `pipewire::` et SPA sont interdits hors de `screen/linux/` par le test d'architecture.

`session/recording_active.rs` ne doit plus appeler directement `screen::win::WindowsRecording` ou `screen::mac::MacRecording` dans des branches qui seraient recopiees pour Linux. L'integration extrait une facade plateforme commune dans `screen/mod.rs` ou `screen/recording.rs`, puis les trois backends l'implementent. Ce refactor reste mecanique et couvert par les tests existants Windows/macOS.

Tokio est confine au worker Portal Linux. La MainLoop PipeWire et tous les objets non `Send` vivent sur un thread OS dedie. Le reste du moteur demeure synchrone.

## Cycle de vie Portal

### Probe sans picker

Le probe Linux interroge via D-Bus :

- la version de `org.freedesktop.portal.ScreenCast` ;
- `AvailableSourceTypes` ;
- `AvailableCursorModes` ;
- la disponibilite de la connexion PipeWire.

Le probe ne declenche jamais le picker et utilise un timeout borne. Ses resultats determinent les capacites techniques du backend brut :

- `displayCapture` seulement si `MONITOR` est annonce ;
- `windowCapture` seulement si `WINDOW` est annonce ;
- `portalSelection = true` seulement si le chemin Portal complet est disponible ;
- `separateCursor = true` seulement si `Metadata` est annonce ;
- `cursorClicks = false` ;
- `cursorShapes = false` au sens semantique : l'ID opaque est capture, mais aucune forme portable n'est garantie ;
- `embeddedCursor = true` seulement si `Embedded` est annonce.

La permission reste `prompt-required` avant le picker. Le portail n'expose pas une autorisation durable fiable a inventer dans le catalogue.

Le catalogue rend les sources virtuelles Portal selectionnables uniquement lorsque le probe Portal/PipeWire reussit et que FFmpeg expose le muxeur MP4 ainsi que `libx264` ou `libopenh264`. Sinon, le catalogue reste vide et publie la raison technique dans `limitations`. Aucun picker n'est ouvert par ce probe.

### Preparation interactive

Sous Linux, `prepare` effectue la phase interactive avant le compte a rebours :

1. creer le proxy ScreenCast ;
2. verifier une nouvelle fois version, source et mode curseur ;
3. `CreateSession` ;
4. `SelectSources`, une seule fois pour cette session ;
5. attendre et verifier explicitement `Request::response()` ;
6. `Start`, une seule fois ;
7. distinguer succes, annulation utilisateur et echec technique ;
8. extraire l'unique descripteur de stream ;
9. `OpenPipeWireRemote` ;
10. connecter le fd possede a PipeWire ;
11. negocier format, buffers et metadonnees ;
12. retourner un objet `PreparedLinuxCapture` arme mais inactif.

Ne pas oublier la reponse asynchrone de `SelectSources` : recevoir un handle D-Bus ne signifie pas que la selection a reussi.

La requete Electron `prepare` est interactive et peut depasser les 30 secondes actuelles. Elle recoit un timeout specifique suffisamment long et une erreur distincte. Un timeout ou la mort d'Electron doit fermer le processus enfant, ce qui ferme la connexion D-Bus ; aucune capture ne doit continuer en arriere-plan.

### Demarrage, pause et reprise

- `start` libere le `StartGate`, fixe l'origine de session et active le stream PipeWire ;
- le premier buffer accepte fixe l'origine temporelle du segment ;
- `pause` desactive le stream et vide proprement la file, mais conserve la session Portal et la connexion PipeWire ;
- `resume` arme une nouvelle origine de segment et reactive le meme stream, sans nouveau picker ;
- `stop`, `cancel`, `discard`, `Drop`, fermeture distante et erreur fatale convergent vers une fermeture idempotente ;
- la session surveille `Session::receive_closed()` et appelle explicitement `Session::close()` lors d'un arret local.

Un nouvel objet Portal n'est cree qu'apres une fermeture complete. Aucun appel `SelectSources` ou `Start` n'est retente sur une session deja utilisee.

### Persistance

Le premier increment utilise `PersistMode::DoNot` par defaut. Un `restoreToken` non nul ne doit pas etre accepte silencieusement tant que Beam ne possede pas une politique de consentement et de stockage explicite.

Si la persistance est activee dans un ticket ulterieur du meme backend :

- exiger ScreenCast version 4 ou plus ;
- ne jamais logguer le token ;
- remplacer atomiquement l'ancien token, a usage unique, par celui du dernier `Start` reussi ;
- accepter que le portail ignore un token obsolete et reaffiche le picker ;
- supprimer le token quand l'utilisateur revoque la permission.

## Ciblage du stream PipeWire

Le descripteur renvoye par `Start` contient un node ID. Depuis ScreenCast version 6, ce node ID est deprecie comme cible durable, car il peut etre reutilise. Il faut preferer la propriete `pipewire-serial` et la passer via `PW_KEY_TARGET_OBJECT`.

`ashpd` 0.13.13 n'expose pas encore cette propriete dans son type public `Stream`. Le ticket Portal doit donc :

1. verifier l'API exacte pinnee dans le lockfile ;
2. utiliser `pipewire-serial` si la crate pinnee l'expose sans ajouter une nouvelle pile D-Bus ;
3. sinon, documenter le gap amont et utiliser le node ID uniquement pour la connexion initiale immediate ;
4. ne jamais reconnecter avec ce node ID ni le persister ; une perte de stream ferme la session et repasse par un nouveau consentement/restore valide.

Un decodeur D-Bus parallele ou un fork local d'`ashpd` ne fait pas partie de ce plan. Si la course entre `Start` et la connexion initiale est reproductible sur une plateforme de la matrice, cette plateforme reste non supportee jusqu'a une API `pipewire-serial` propre.

Le `Stream.id` opaque du Portal identifie la source dans une session restauree. Il ne doit jamais etre confondu avec `MetaCursor.id`.

## Negotiation PipeWire sans wgpu

Le stream est connecte en entree video avec une liste ordonnee et minimale de formats raw CPU pris en charge par le moteur :

1. BGRx ;
2. BGRA ;
3. RGBx ;
4. RGBA.

Le format reel, la largeur, la hauteur et le stride viennent du POD SPA negocie. Les valeurs logiques `position` et `size` du Portal ne servent pas de dimensions pixels.

Apres `param_changed(Format)`, le client demande explicitement :

- des buffers `MemPtr` ou `MemFd` ;
- `SPA_META_Header` ;
- `SPA_META_Cursor` ;
- `SPA_META_VideoCrop` ;
- `SPA_META_VideoTransform` lorsque les headers/runtime le permettent ;
- `SPA_META_VideoDamage` uniquement comme optimisation, jamais comme condition de correction.

Utiliser `StreamFlags::MAP_BUFFERS`. Le callback accepte uniquement un payload CPU effectivement mappe. Un DMA-BUF non mappable produit une erreur `unsupported-memory-type` claire. Il ne faut jamais mapper lineairement un DMA-BUF tiled ou lire un fd au hasard. La matrice materielle doit prouver que GNOME, KDE et le backend wlroots retenu acceptent le chemin SHM/MemFd ; sinon cet environnement reste non supporte par ce premier increment.

Pour chaque buffer :

- valider le nombre de planes ;
- borner `chunk.offset` et `chunk.size` par `maxsize` ;
- verifier le stride, y compris padding et signe ;
- detecter multiplication et addition debordantes ;
- refuser les dimensions nulles ou superieures aux limites documentees ;
- appliquer crop et transform dans un adaptateur teste ;
- copier les octets utiles dans une frame possedee avant de requeue le buffer ;
- ne jamais conserver de pointeur, slice ou fd emprunte apres le callback.

La conversion vers le format canonique du moteur est une fonction pure testee pour les quatre formats. Le callback PipeWire ne fait ni JSON, ni acces disque, ni traitement lourd.

## File et pression

Le thread PipeWire envoie les `OwnedScreenSample` dans une file bornee par `RecordingSettings.queue_capacity`.

Politique :

- ne jamais bloquer le callback temps reel ;
- conserver l'ordre des echantillons acceptes ;
- laisser tomber explicitement une frame quand la file est pleine ;
- incrementer `framesDropped` et produire une discontinuite de sante ;
- resoudre l'etat courant du curseur avant l'envoi afin qu'un changement d'ID ne soit pas perdu avec une frame rejetee ;
- ne coalescer que les mouvements, jamais une transition d'identite ou de visibilite.

Le sink decide de la cadence qu'il accepte. Le backend ne simule pas des frames pour atteindre `target_fps`.

## Timestamp

`SPA MetaHeader.pts` est un timestamp de presentation en nanosecondes. `seq` et les flags `DISCONT`, `CORRUPTED` et `GAP` doivent etre conserves jusqu'a l'adaptateur de sante.

Politique par segment :

1. attendre le `StartGate` ;
2. sur la premiere frame acceptable, choisir une source de temps ;
3. si `pts >= 0`, ancrer ce PTS a `start_ns` avec une frequence de 1 000 000 000 ;
4. sinon, utiliser l'instant monotone reel de reception comme source explicitement marquee `monotonic-arrival` ;
5. ne jamais changer de source de temps au milieu du segment ;
6. si le PTS selectionne regresse, est corrompu ou devient absent, rejeter la frame et publier une discontinuite ;
7. les valeurs calculees doivent rester monotones et utiliser des operations verifiees/saturantes conformes au contrat d'horloge existant.

Le fallback d'arrivee n'est donc pas silencieux : il est present dans `TimestampSource`, les diagnostics et `health.jsonl`. Image et curseur utilisent toujours le timestamp final unique de l'echantillon.

Le reporter periodique doit publier le dernier PTS natif avec `nativeRate = 1_000_000_000`, pas deduire la position native du nombre de frames.

## Machine d'etat du curseur

`MetaCursor.id` est un `u32` opaque. La valeur zero signifie **aucune nouvelle donnee curseur dans ce buffer**, pas un curseur dont l'identifiant serait zero.

Etat par stream :

```text
Unknown
  + meta valide, id != 0 -> Known(id, position, hotspot optionnel)

Known
  + meta valide, id != 0 -> remplace identite et donnees
  + meta valide, id == 0 -> conserve l'identite, actualise seulement les champs valides
  + meta absente/invalide -> echantillon Unknown, aucun faux mouvement
```

Regles :

- exposer l'identite native comme `pipewire:<stream-scope>:<id>` afin d'eviter une collision entre streams ;
- conserver directement l'ID SPA opaque ; ne jamais le remplacer par un hash du bitmap, car un compositeur peut publier un nouvel ID sans republier les pixels ;
- conserver x/y signes tels que recus ;
- calculer la visibilite a partir de la geometrie negociee et des indications documentees, jamais d'une valeur par defaut ;
- lire le hotspot seulement si la metadonnee bitmap associee est valide ;
- `bitmap_offset == 0` signifie qu'aucun nouveau bitmap n'est fourni, pas que le curseur est cache ;
- ignorer les pixels du bitmap apres validation des bornes ; ils ne sont pas persistes ;
- ne produire aucun evenement `Button` ;
- ne produire aucun `CursorKind` semantique autre que `Custom`.

Le tuple interne transporte toujours `native_cursor_id` avec la position connue. Pour conserver cette association dans le sidecar Beam, ajouter un champ optionnel `cursorId` aux evenements `Move`, avec lecture retrocompatible. Un evenement `Shape` n'est emis que lorsqu'un nouvel ID et un hotspot valides permettent de satisfaire son contrat actuel ; aucune valeur `(0, 0)` n'est inventee.

## Integration au moteur Beam

Le plan conserve la frontiere existante :

```text
Vue -> window.capture -> preload -> IPC nomme -> JSONL -> Rust
```

Ni le fd PipeWire, ni les buffers, ni les tokens Portal ne remontent dans Electron ou Vue.

Le branchement utilise la facade `screen` de la bibliotheque `capture`. Le mode materiel opt-in de `capture-probe` appelle exactement la meme facade que `ActiveRecordings` ; il ne possede aucune implementation Portal/PipeWire alternative. Il injecte seulement un sink borne qui compte et valide les echantillons, puis affiche un bilan JSON final. Il ne fait jamais transiter les pixels par stdout.

Le sink produit est cree seulement apres validation de FFmpeg. Le format negocie PipeWire cree la `TrackMetadata` video avec des dimensions reelles ; les dimensions impaires sont completees par padding pour la sortie YUV420. Chaque segment est d'abord ecrit en `segment-NNNN.partial.mp4`, puis fsync et renomme apres validation.

Le recorder normal respecte les points suivants :

- `ScreenSelection::Portal` devient le seul mode Linux supporte ;
- le catalogue expose une source virtuelle de picker avec `selectionMode = portal` ;
- le builder Electron construit `{ mode: "portal", kind, restoreToken: null }`, jamais `{ mode: "source" }` avec un faux ID ;
- `track_metadata` attend la negotiation sans publier de largeur, hauteur ou codec fictifs ;
- les dimensions negociees et le format de sortie du sink mettent a jour la piste avant le passage a `Armed` ;
- `selected_sources.screen` enregistre l'ID opaque de stream Portal quand il existe, pas le node ID reutilisable ;
- `ActiveRecordings` possede un handle Linux et ses metriques ;
- l'objet prepare Linux survit a pause/reprise ;
- `platform.backend` devient `xdg-portal-pipewire` uniquement apres ouverture reussie ;
- les erreurs Portal/PipeWire utilisent des codes stables au lieu du seul `capture-error` ;
- le timeout Electron devient specifique a la commande interactive ;
- le chemin du binaire et le packaging connaissent Linux ; FFmpeg reste une dependance systeme verifiee au runtime.

Le modele de piste n'utilise jamais `width = 0`, `height = 0`, `codec = "raw"` ou un autre placeholder. Un format de sortie n'existe qu'apres la negotiation PipeWire et l'application de la politique de padding du sink.

Le probe reste un consommateur de test de la meme API native. Il ne devient jamais une seconde voie d'execution et ne justifie aucun branchement special dans Electron.

## Erreurs et comportement visible

Codes minimum :

- `portal-unavailable` ;
- `portal-version-unsupported` ;
- `portal-cursor-metadata-unavailable` ;
- `portal-cancelled` ;
- `portal-denied` ;
- `portal-session-closed` ;
- `portal-invalid-stream-response` ;
- `pipewire-connect-failed` ;
- `pipewire-stream-disconnected` ;
- `pipewire-format-unsupported` ;
- `pipewire-memory-unsupported` ;
- `pipewire-buffer-invalid` ;
- `pipewire-timestamp-discontinuity` ;
- `screen-sink-backpressure` ;
- `screen-sink-failed` ;
- `ffmpeg-unavailable` ;
- `ffmpeg-encoder-unavailable` ;
- `ffmpeg-failed` ;
- `ffmpeg-output-invalid`.

Politique curseur :

- une requete `CursorSelection::Separate` exige `Metadata` ; sinon `prepare` echoue clairement ;
- `CursorSelection::Embedded` demande `Embedded` seulement si annonce ;
- `CursorSelection::Disabled` demande `Hidden` ;
- aucune bascule automatique entre ces modes ;
- le mode separe refuse `captureClicks = true` ;
- un manque ponctuel de metadonnee curseur rend seulement cet echantillon inconnu ;
- une absence structurelle de `MetaCursor` apres negotiation degrade ou echoue la piste selon la politique de session, sans creer de donnees.

## Plan de livraison

Etat du code : LNX-00 a LNX-04 et LNX-06 sont implementes. LNX-05 reste la matrice de validation interactive a executer sur le materiel cible ; elle ne bloque pas les tests deterministes mais reste obligatoire avant une declaration de compatibilite pour chaque environnement de bureau.

```text
LNX-00 Contrat generique et probe honnete
  -> LNX-01 Cycle Portal prepare
      -> LNX-02 Stream PipeWire CPU
          -> LNX-03 Timestamp et curseur atomiques
              -> LNX-04 Integration moteur/probe Rust
                  -> LNX-05 Tests materiels d'acquisition
                      -> LNX-06 Gate recorder produit/session/distribution
```

### LNX-00 — Contrat generique et probe

Travail :

- ajouter les types `OwnedScreenSample` et `ScreenSampleSink` neutres ;
- extraire la facade `ScreenOpenRequest`/handle/metriques commune aux backends win, mac et linux ;
- faire passer `ActiveRecordings` par cette facade au lieu d'importer directement chaque implementation ;
- ajouter les dependances Linux ciblees ;
- remplacer les diagnostics fondes sur les variables d'environnement par un probe injecte ;
- supprimer la promesse X11 directe non implementee ;
- garder les capacites publiques de recording a `false` tant qu'aucun sink produit n'existe ;
- ajouter les erreurs typees ;
- etendre le test d'architecture aux imports Linux natifs.

Tests :

- Portal absent, version 1, version 2+, sources partielles ;
- modes Hidden, Embedded et Metadata dans toutes les combinaisons ;
- PipeWire absent ;
- probe en timeout ;
- serialisation des nouvelles erreurs ;
- sink qui accepte, refuse ou tombe en panne.
- non-regression des appels start/stop/metriques Windows et macOS apres extraction de la facade.

Gate : le diagnostic decrit exactement le backend brut, tandis que `discover`, `capabilities` et le HUD ne promettent toujours aucun recorder incomplet.

### LNX-01 — Preparation Portal

Travail :

- implementer CreateSession/SelectSources/Start/OpenPipeWireRemote ;
- verifier toutes les `Request::response()` ;
- demander une seule source et `CursorMode::Metadata` ;
- distinguer cancel, deny et erreur technique ;
- surveiller `Closed` ;
- rendre la fermeture idempotente ;
- gerer le ciblage par `pipewire-serial` et son gap ashpd ;
- adapter le timeout interactif Electron.

Tests :

- moniteur, fenetre et choix mixte ;
- zero stream et plusieurs streams inattendus ;
- annulation a chaque etape ;
- reponse invalide ou tardive ;
- fermeture distante avant/apres OpenPipeWireRemote ;
- appel stop/cancel/drop repete ;
- token absent et token refuse en mode non persistant.

Gate : aucune ressource Portal ni fd ne survit a une sortie ou un echec.

### LNX-02 — Stream et buffers CPU

Travail :

- creer la MainLoop sur un thread dedie ;
- connecter le remote fd ;
- negocier les quatre formats raw ;
- demander MemPtr/MemFd et les metadonnees requises ;
- parser le format et copier les buffers ;
- appliquer crop/transform ;
- brancher la file bornee et les metriques ;
- propager deconnexion et format change.

Tests :

- chacun des quatre formats et conversions ;
- stride avec padding et stride invalide ;
- offset/size/maxsize aux limites ;
- dimensions nulles, enormes et debordements ;
- buffer multi-plane inattendu ;
- MemPtr, MemFd, DMA-BUF mappable et non mappable ;
- queue pleine ;
- changement de format et resolution ;
- crop absent/valide/invalide, rotation et damage absent.

Gate : un stream simule produit des frames possedees valides sans conserver un emprunt PipeWire.

### LNX-03 — Temps et curseur

Travail :

- parser Header et Cursor sur le meme buffer ;
- ancrer PTS ou arrivee monotone au StartGate ;
- implementer la machine d'etat ID zero ;
- associer identite, x/y et timestamp dans le sample ;
- adapter le sidecar curseur sans bitmap ni clic ;
- publier PTS et discontinuite dans timing/health.

Tests :

- PTS initial normal, negatif, absent, regression, GAP, CORRUPTED et overflow ;
- egalite stricte des timestamps image/curseur ;
- id zero avant tout ID, apres un ID et apres pause/reprise ;
- changement d'ID et hotspot ;
- metadonnee absente ou tronquee ;
- position negative, bord, hors image, HiDPI, crop et rotation ;
- bitmap absent, offset invalide et bitmap valide ignore ;
- preuve qu'aucun clic, nom semantique ou position n'est invente.

Gate : chaque coordonnee connue arrive au moteur avec le bon ID et le timestamp exact de sa frame.

### LNX-04 — Moteur Rust et probe materiel

Travail :

- raccorder `LinuxRecording` a la facade plateforme commune et au trait `ScreenSampleSink` ;
- utiliser le meme point d'entree depuis `ActiveRecordings` et `capture-probe` ;
- ajouter un sous-mode opt-in a `capture-probe` sans pixels sur stdout ;
- integrer prepare/start/pause/resume/stop/cancel sur l'objet de capture brut ;
- garder le picker ferme pendant pause/reprise ;
- produire un bilan final de format, frames, drops, PTS et echantillons curseur ;
- ne creer aucun manifeste ou track complete fictive ;
- garder ce chemin entierement hors du renderer.

Tests :

- prepare/start/pause/resume/stop ;
- cancel et discard a chaque etat ;
- fermeture Portal/PipeWire en cours de session ;
- format negocie present dans le bilan ;
- metriques de frames et drops ;
- aucune frame sur stdout ;
- aucun manifeste, segment ou track marque complete.
- preuve que le probe n'appelle aucun module `screen::linux` directement.

Gate : le moteur Rust recoit le flux brut reel et le probe peut le fermer proprement sans pretendre avoir enregistre une video.

### LNX-05 — Materiel d'acquisition

Matrice opt-in :

- Fedora stable actuelle, GNOME Wayland ;
- KDE Plasma Wayland sur une distribution moderne ;
- un environnement wlroots avec son backend Portal supporte ;
- moniteur et fenetre ;
- curseur immobile, en mouvement, hors source et changement d'ID ;
- picker accepte et annule ;
- scaling fractionnaire, rotation et plusieurs ecrans ;
- pause/reprise ;
- saturation de file ;
- suspend/reprise, hotplug et fermeture Portal ;
- chemin SHM/MemFd et erreur propre si seul DMA-BUF est propose ;
- execution depuis le binaire Rust `capture-probe` compile sur la machine testee.

Gate : Fedora GNOME passe obligatoirement image + PTS + id/x/y. Les autres environnements publient leur capacite reelle et ne sont jamais marques supportes sur hypothese.

### LNX-06 — Gate recorder produit, session et distribution

Implementation livree :

- sink FFmpeg consommant `OwnedScreenSample` ;
- dependance runtime et erreurs stables documentees ;
- `ScreenSelection::Portal`, catalogue virtuel, Electron et types TS raccordes ;
- format de piste resolu pendant la preparation interactive ;
- meme facade `RecordingSession`/`ActiveRecordings`, timing, health et sidecar curseur ;
- timeout interactif et arret du moteur en cas de depassement ;
- chemin de binaire Linux et cibles de packaging ;
- segment partiel, sortie FFmpeg reussie/non vide, fsync puis publication atomique ;
- pause/reprise sans nouveau picker et finalisation des segments ;
- tests Rust, Node et Vue cibles.

Le smoke synthetique valide le vrai FFmpeg local. La preuve Portal/PipeWire avec un ecran reel reste le test interactif LNX-05 confie a l'utilisateur.

## Strategie de tests

Les parsers Portal/SPA et les machines d'etat utilisent de petites interfaces injectables et des fixtures possedees. Les tests deterministes ne dependent jamais d'un compositor, de D-Bus ou de PipeWire reel.

Tests principaux :

```text
packages/capture/tests/linux_portal.rs
packages/capture/src/screen/linux/pipewire/tests.rs
packages/capture/src/screen/linux/ffmpeg_process_tests.rs
packages/capture/src/screen/linux/ffmpeg_sink.rs
test/capture-config.test.cjs
test/capture-engine-path.test.cjs
test/capture-ipc.test.cjs
```

Les tests materiels restent derriere `hardware-tests` et `#[ignore]`, avec une configuration explicite. Ils ne font jamais partie de la CI deterministe ordinaire.

Validations finales ciblees sur Fedora native :

```bash
cargo fmt --all --check
cargo test -p capture --test architecture
cargo test -p capture --test linux_portal
cargo test -p capture --lib screen::linux
cargo clippy -p capture --all-targets --all-features -- -D warnings
cargo build -p capture --bin capture-engine
```

Dans l'environnement WSL du depot, toute commande `cargo` ou `npm` doit etre lancee via `powershell.exe`. Cela valide les contrats communs, mais ne remplace pas le build Linux natif car le code sous `cfg(target_os = "linux")` n'y est pas compile :

```powershell
powershell.exe -NoProfile -Command "cargo fmt --all --check"
powershell.exe -NoProfile -Command "cargo test -p capture --test architecture"
powershell.exe -NoProfile -Command "cargo test -p capture --test model"
powershell.exe -NoProfile -Command "cargo test -p capture --test catalog"
powershell.exe -NoProfile -Command "cargo test -p capture --test session"
powershell.exe -NoProfile -Command "cargo test -p capture --test cursor"
powershell.exe -NoProfile -Command "cargo clippy -p capture --all-targets --all-features -- -D warnings"
powershell.exe -NoProfile -Command "node --test test/capture-config.test.cjs test/capture-engine-path.test.cjs test/capture-ipc.test.cjs"
```

Ne pas lancer toutes les suites pour un ticket localise. Chaque ticket execute les tests les plus proches ; Sol execute les validations finales de son gate.

## Criteres d'acceptation

Le gate de capture native est accepte seulement si :

- le picker systeme est la seule voie d'autorisation ;
- le backend ne contient aucune API specifique a un compositor ;
- Linux est range sous `screen/linux/` et utilise exactement la meme facade session-facing que `screen/win/` et `screen/mac/` ;
- aucune commande JSONL, API preload ou moteur parallele propre a Linux n'est ajoute ;
- `Metadata` est exige et le curseur n'est pas dessine dans les pixels ;
- chaque frame acceptee possede un timestamp monotone et une provenance explicite ;
- chaque position de curseur connue transporte le meme `session_ns` que sa frame et un ID opaque non fabrique ;
- `id == 0`, metadata absente, hotspot absent et DMA-BUF non mappable sont traites selon le contrat documente ;
- aucun clic, forme semantique, frame ou permission n'est simule ;
- le callback PipeWire ne bloque pas et aucune reference de buffer n'en sort ;
- les pertes sont bornees, comptees et visibles ;
- pause/reprise ne reaffiche pas le picker ;
- cancel, stop, drop, fermeture distante et erreur liberent toutes les ressources ;
- Fedora GNOME Wayland passe le smoke test reel ;
- KDE et wlroots sont supportes uniquement apres preuve materielle ;
- le code respecte les frontieres Rust/Electron et la limite de 500 lignes ;
- aucun changement n'annonce un recorder Linux complet avant le gate produit.

## Sources techniques primaires

- [XDG Desktop Portal ScreenCast](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html)
- [XDG Desktop Portal Request](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Request.html)
- [XDG Desktop Portal Session](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Session.html)
- [ashpd 0.13 ScreenCast](https://docs.rs/ashpd/0.13.13/ashpd/desktop/screencast/)
- [ashpd 0.13 feature flags](https://docs.rs/crate/ashpd/0.13.13/features)
- [PipeWire Rust Context](https://pipewire.pages.freedesktop.org/pipewire-rs/pipewire/context/struct.Context.html)
- [PipeWire Rust Buffer](https://pipewire.pages.freedesktop.org/pipewire-rs/pipewire/buffer/struct.Buffer.html)
- [SPA buffers and memory types](https://pipewire.pages.freedesktop.org/pipewire/group__spa__buffer.html)
- [SPA cursor metadata](https://pipewire.pages.freedesktop.org/pipewire/structspa__meta__cursor.html)
- [PipeWire stream targeting](https://pipewire.pages.freedesktop.org/pipewire/page_streams.html)
- [Fedora pipewire-devel](https://packages.fedoraproject.org/pkgs/pipewire/pipewire-devel/)
- [Fedora xdg-desktop-portal](https://packages.fedoraproject.org/pkgs/xdg-desktop-portal/xdg-desktop-portal/)
- [Fedora GNOME portal backend](https://packages.fedoraproject.org/pkgs/xdg-desktop-portal-gnome/xdg-desktop-portal-gnome/)
