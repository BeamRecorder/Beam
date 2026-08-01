# macOS development

Install dependencies, then start Beam locally:

```bash
npm ci
npm run dev:all
```

Build a distributable macOS application with:

```bash
npm run electron:build -- --mac dmg --publish never
```

Read and follow these repository rules before changing the application:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)
