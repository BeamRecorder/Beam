# Windows development

Develop and test DemoRecorder on Windows through PowerShell.

```powershell
npm ci
npm run dev:all
```

Build a distributable Windows application with:

```powershell
npm run electron:build -- --win nsis --publish never
```

Read and follow these repository rules before changing the application:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)
