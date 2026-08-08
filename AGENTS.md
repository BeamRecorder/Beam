# Repository Guidance

All contributors and coding agents must read the following documents before changing the repository:

- [UI guidelines](docs/UI.md)
- [Architecture guidelines](docs/ARCHITECTURE.md)
- [Code quality guidelines](docs/CODE_QUALITY.md)
- [Electron window guidance](docs/electron_window.md) — mandatory before changing Electron windows, window IPC, transparent-window layout, popovers, shadows, sizing, or mouse/focus behavior.

These documents are part of the repository's engineering contract. If an implementation conflicts with them, update the design or ask for clarification before adding the code.

When a task affects Electron windows, read `docs/electron_window.md` first and follow its checklist. It documents the native-window pitfalls that CSS alone cannot fix.

## Build :

You are in a WSL envrionnement, if you use `npm` or `cargo`, prefix it via powershell.exe

## Non-negotiable defaults

- Keep UI code consistent with `docs/UI.md`: use the existing `src/components/ui/` primitives, Lucide icons, theme tokens, and scoped styles without deep selectors whenever possible.
- Keep code organized according to `docs/ARCHITECTURE.md`: preserve the Electron security boundary and keep capture-domain logic in Rust.
- Keep changes consistent with `docs/CODE_QUALITY.md`: no source file over 500 lines, types in dedicated type files, readable small units, and tests for TypeScript and Rust changes.

## Verification

Before handing off a change, run the smallest relevant checks and report any unavailable platform-specific checks. For frontend changes, run the TypeScript build and Vitest. For Rust changes, run formatting, tests, and Clippy when the toolchain is available.

## Protocole d'exécution du goal

- **Sol** lit les plans et leurs dépendances, identifie les critères d'acceptation et les gates, décide l'architecture, écrit tout le code produit, intègre, relit les diffs et exécute les validations finales. Sol est le seul à modifier le code produit et à effectuer, lorsqu'ils sont demandés, les commits et merges.
- Sol délègue systématiquement aux subagents **Luna** les tâches bornées de recherche, audit, revue, écriture de tests et exécution de tests. Les tâches indépendantes sont confiées à plusieurs Luna en parallèle lorsque des slots sont disponibles.
- Le périmètre d'écriture des Luna est limité aux fichiers de tests explicitement confiés. Les Luna ne modifient jamais le code produit, les plans, `AGENTS.md`, les branches, l'index, les commits, les merges ni aucun autre état Git.
- Tout test ou rapport produit par Luna est relu par Sol. Sol ajuste les tests si nécessaire et exécute lui-même les validations finales avant de considérer un gate comme réussi.
- Un résultat Luna est une contribution à l'analyse et ne constitue jamais, à lui seul, une preuve de gate. Sol reste responsable de la décision finale et de la conformité intégrale de chaque ticket.
