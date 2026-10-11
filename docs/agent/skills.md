# Beam agent skills

Install the Beam skills before asking an agent to capture, compose or edit with Beam:

```sh
beam-cli skills install
beam-cli skills check
beam-cli skills update
```

In a source checkout use `bun run beam` in place of `beam-cli`. The packaged CLI needs no separate Bun/Node installation. Reload your agent's skills or start a new agent session after installation.

## Destination

The default is `.agents/skills` inside the current working directory. `install`, `check` and `update` all use this project-local path unless you explicitly select another destination. For an agent-specific project directory:

```sh
beam-cli skills install --agent claude
beam-cli skills install --agent cursor
beam-cli skills install --agent gemini
beam-cli skills install --dir /path/to/agent/skills
```

Supported agent names are `agents`, `claude`, `cursor` and `gemini`. `--agent` chooses `.NAME/skills` in the current project. Only an explicit `--global` uses the home directory instead. The shared `.agents/skills` location is used by agents that support shared Agent Skills discovery. `--dir` supports any agent with a custom location and cannot be combined with `--agent` or `--global`.

Select specific skills by name on any command. Install `beam-cli` with domain skills if you want the shared entry point and authoring reference:

```sh
beam-cli skills install beam-cli beam-design beam-composition beam-animation
beam-cli skills check beam-composition beam-animation
```

Each skill is a normal directory containing `SKILL.md`, plus its relevant references/assets. No proprietary agent configuration is required.

## Included skills

| Skill | Purpose |
| --- | --- |
| `beam-cli` | Discover installed tools, choose a workflow, use revision-safe live authoring |
| `beam-design` | Read design/frame briefs, ask missing questions, plan real visual content |
| `beam-composition` | HTML/TypeScript, optional Vue, publication/watch, standalone motion |
| `beam-animation` | Seek-safe animation, GSAP, WebGL and native property tracks |
| `beam-recording` | Native capture discovery, real recordings and raw screenshots |
| `beam-screenshot` | Still documents, native text/layers, backgrounds, effects and PNG/WebP |
| `beam-video-editor` | Cuts, timing, native titles, presentation, zooms and captions |
| `beam-assets` | Media imports, font identity, references and portable resources |
| `beam-audio` | Timeline sound, gain/fades, synchronization and listening checks |
| `beam-export` | Live/standalone render, frame review, output protection and delivery |

For new artwork, the agent reads existing `design.md`/`frame.md` first and asks only for missing decisions. When the user delegates creative choices, the agent records them and proceeds. Concrete edits retain the established design.

## Repository source and freshness

The maintained source is [`BeamRecorder/Beam/.skills/Beam-cli`](https://github.com/BeamRecorder/Beam/tree/master/.skills/Beam-cli). The CLI resolves `master` to a commit first, then downloads that commit's manifest and files. SHA-256 hashes validate every file before any installed skill changes. No downloaded code is executed by the installer.

Use `--ref TAG_OR_COMMIT` to select a release or pin the pack. No automatic network check runs on ordinary CLI commands.

`check` reads the repository manifest and local contents without changing them. JSON reports `missing`, `current`, `outdated`, `modified` or `conflict`; it exits 1 unless every selected skill is current. Network or manifest failures are errors, not stale-skill reports. Freshness compares skill content/pack version, not the Beam application version. The installed CLI's bundled schemas remain the authority for runtime compatibility.

`install` and `update` synchronize the selected pack, including missing selected skills. Already-current skills are left alone. Local additions/edits are protected. `--force` replaces a modified **Beam-managed** skill only after preserving its entire old folder in `.beam-skills-backups` beside the destination skills directory; the JSON result includes the backup path. An unmanaged/conflicting folder is never replaced, including with `--force`. Symlink paths are rejected.

All downloads are validated before publication; each skill directory is staged and swapped separately. Publication is atomic per skill, not a transaction across the whole pack. If filesystem publication fails after some skills changed, rerun the command to finish synchronization.

## Local development / offline source

```sh
bun run beam skills install --source .skills/Beam-cli --dir /tmp/beam-agent-skills
bun run beam skills check --source .skills/Beam-cli --dir /tmp/beam-agent-skills
node scripts/skills-manifest.mjs --check
```

`--source` points directly at the pack directory and cannot be combined with `--ref`. Use it for unpushed changes or offline installs; the same manifest/checksum validation applies. The remote installer can retrieve a new pack only after its files and manifest are pushed to the requested Beam ref.

When changing skills, update their content and run `node scripts/skills-manifest.mjs` to refresh hashes. Bump the manifest's independent semantic version when publishing a new pack release. Keep examples aligned with the real CLI and validate the included skills and composition assets before release.
