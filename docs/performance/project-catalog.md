# Project picker measurements

Measured on 2026-10-03 on Linux, Intel Core Ultra 5 125H. Times below concern catalogue requests, excluding thumbnail decoding, native window creation and Vue module loading unless stated otherwise. Filesystem caches were not flushed. These are local development measurements, not latency guarantees.

## Existing library: 78 projects

The library contains 71 video projects and 7 screenshots. An initial measurement before the repeated-manifest-read fix took 1,524 ms for the complete catalogue: 286 reads of `project.json`, totalling 210,564,692 bytes. After that fix, one request read each video manifest once: 71 reads, totalling 22,219,940 bytes. These initial diagnostic samples used system Node v24.19.0 and were single observations.

The following final benchmark used **Electron's embedded Node v24.21.0**. Repeated phases report the median of five samples, with the observed range in parentheses. The first worker request has one sample; its index already existed.

| Operation | Duration | Summaries returned | Response size |
| --- | ---: | ---: | ---: |
| Complete catalogue after the manifest-read fix | 102.8 ms (81.9–383.5) | 78 | 38,607 bytes |
| First worker request, existing index | 68.0 ms, one sample | 40 | 19,433 bytes |
| Fresh worker, persistent index | 47.7 ms (37.7–65.5) | 40 | 19,433 bytes |
| Active worker, first page with file revalidation | 20.6 ms (17.8–29.7) | 40 | 19,433 bytes |
| Next page | 0.7 ms (0.6–0.7) | 38 | 19,525 bytes |

A two-millisecond heartbeat on the calling thread had a median maximum gap of 104.0 ms during complete synchronous listing, versus 2.7 ms with a fresh catalogue worker. The worker moves parsing and SQLite work off that thread; it does not make the disk infinitely fast.

The initial index construction plus first 40 summaries took **196 ms** in an earlier system-Node diagnostic sample. This is a one-time cost for an unchanged library, not the cost of every new worker. Revalidation still enumerates folders and checks metadata/media stamps, so first-page latency grows with library size. Warm pages do not reread unchanged project JSON; a focused test verifies reuse across index instances.

After a fresh Electron restart, the first native Projects window presentation took **323 ms**, including renderer/module and native-window startup, with 40 summaries loaded and 12 cards mounted. There is no corresponding pre-change native-window timing, so the backend improvement should not be presented as a measured end-to-end UI speedup.

Native checks also confirmed: a search finds a project outside the initial page; clearing search restores 40 summaries; scrolling loads the remaining 38; body scroll width equals body width. Component tests cover automatic continuation, global Select all, stale replies and selection cancellation. The persistent database occupied 188,416 bytes after closing its worker.

After closing Projects and putting the HUD in tray standby, Electron and its descendants used **313 MiB PSS** in this development run, compared with a previous approximately 302 MiB observation. These different-run observations do not establish a RAM improvement. Vite is excluded. Idle worker termination is verified separately; no catalogue worker is permanently retained in the tray.

## Temporary large library: 1,000 projects

Generated only in a temporary directory, then removed. It contains 67,363,890 bytes of project JSON with saved zoom timelines, without media decoding. This benchmark used system Node v24.19.0; it is a scaling check rather than a simulation of the user's exact media library.

| Operation | Duration | Summaries returned |
| --- | ---: | ---: |
| Complete catalogue after the manifest-read fix | 224.5 ms median | 1,000 |
| Initial index construction | 541.7 ms, one sample | 40 |
| Fresh worker, persistent index | 121.1 ms median | 40 |
| Active worker, revalidated first page | 55.3 ms median | 40 |
| Next page | 1.1 ms median | 40 |

The first index build costs more than a complete listing in this synthetic fixture. Its benefit comes from subsequent reuse, bounded transfers and keeping work off the main thread. Responses shrink from 325,891 bytes for all projects to 13,339 bytes for one page. The median heartbeat gap decreases from 225.7 ms for synchronous listing to 2.7 ms with a fresh worker.

## Reproduction

Use Electron's embedded Node for the existing library:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron scripts/performance/profile-project-catalog.cjs --root /absolute/path/to/user/projects
```

Generate and clean up an isolated fixture:

```sh
node scripts/performance/profile-project-catalog.cjs --count 1000 --samples 5
```

The script prints aggregate timings, counts and byte sizes, without project names or IDs. Existing-library profiling updates only the derived index; the project store uses read-only metadata mode. Do not delete a user's project directory to simulate a cold index.

Targeted Node tests cover indexing, paging, dependencies, cache repair, trust checks and worker lifecycle. Vue tests cover the catalogue composable and picker interaction; focused coverage of `useProjectCatalog` and `useProjectPicker` exceeds 90% for statements, branches, functions and lines. Vue type checking and the renderer build pass. Native runtime checks were performed on Linux; Windows/macOS runtime checks remain unavailable here.

This follows Electron's recommendations to [measure bottlenecks, defer loading and avoid blocking main-process work](https://www.electronjs.org/docs/latest/tutorial/performance). Node documents [`DatabaseSync` as synchronous](https://nodejs.org/api/sqlite.html#class-databasesync), which is why the index belongs in a worker. A Rust rewrite is not required for these improvements.
