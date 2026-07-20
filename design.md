# Design System: DemoRecorder

Ce document décrit le design system appliqué à l'application **DemoRecorder**, structuré avec des couleurs franches et modernes, et une typographie système sans empattement (sans-serif system stack).

## 1. Palette de Couleurs (Couleurs Franches)

Les variables CSS correspondantes sont définies dans [style.css](file:///c:/Users/binos/Documents/Personal_project/OSS/DemoRecorder/demo-recorder/demo-recorder/src/style.css).

| Nom du Token | Couleur | Code Hex | Description |
|---|---|---|---|
| `--color-orange` | Orange Moderne | `#ff5a1f` | Couleur primaire d'accent, dynamique et moderne. |
| `--color-blue` | Bleu Sympa / Cool Blue | `#2563eb` | Couleur secondaire, contrastée et professionnelle. |
| `--color-dark-blue` | Noir Bleu / Slate Dark | `#0f172a` | Couleur sombre de fond, de bordure et de texte contrasté. |
| `--color-light-blue` | Blanc Bleu / Blanc Cassé | `#f8fafc` | Fond général doux avec une légère teinte bleutée. |
| `--color-border` | Bordure Bleutée | `#cbd5e1` | Couleur douce pour les séparations et les bordures. |

## 2. Typographie

Nous utilisons une pile de polices système moderne sans empattement pour de meilleures performances (pas de chargement de police externe) et un rendu parfaitement net.

- **Famille de police** : `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`
- **Graisses** :
  - Regular : `400`
  - Medium : `500`
  - Semi-Bold : `600`
  - Bold : `700`

## 3. Composants UI (dans `src/components/ui/`)

Tous les composants respectent ce design system et sont importables depuis l'alias `~/ui/*` ou `~/components/ui/*` :

1. **Button (`~/ui/button/Button.vue`)** : Supporte plusieurs variantes (primary/orange, secondary/blue, outline, ghost) et prend un paramètre `tooltip` pour afficher une info-bulle automatique.
2. **Tooltip (`~/ui/tooltip/Tooltip.vue`)** : Info-bulle flottante survolée.
3. **Popover (`~/ui/popover/Popover.vue`)** : Panneau flottant déclenché au clic.
4. **Select (`~/ui/select/Select.vue`)** : Menu de sélection personnalisé avec chevron dynamique.
5. **Dialog (`~/ui/dialog/Dialog.vue`)** : Modal animée avec flou d'arrière-plan (`backdrop-filter: blur`).
6. **Toast (`~/ui/toast/toastStore.ts` & `ToastProvider.vue`)** : Notification temporaire gérée par un store Pinia.
