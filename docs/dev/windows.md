# Windows development

Develop and test Beam on Windows through PowerShell.

```powershell
npm ci
npm run dev:all
```

Build a distributable Windows application with:

```powershell
npm run electron:build -- --win nsis --publish never
```

## Publish a release

1. Increase `package.json` to a stable semantic version, for example `0.1.1`.
2. Commit the change with a message beginning with `[RELEASE]` and push it as `ExtraBinoss`.

The GitHub Actions workflow compares this version with the latest GitHub Release before starting a Windows build. It fails when the version already exists or is lower, then creates a release whose tag is exactly the package version (for example `0.1.1`). The release contains the NSIS installer, its blockmap, and `latest.yml` used by the in-app updater.

Read and follow these repository rules before changing the application:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)
