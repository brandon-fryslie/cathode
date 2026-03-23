# Monokle → electron-bridge: Compatibility Analysis

## What is Monokle?

[Monokle](https://github.com/kubeshop/monokle) is a production Kubernetes IDE built with Electron + React 18 + Redux + Ant Design. It provides YAML editing (Monaco), cluster management, policy validation (OPA), git integration, plugin/template systems, and terminal emulation (xterm + node-pty).

It is **dramatically more complex** than the colorpicker app:
- ~2,155 source files
- 58 TypeScript files in the Electron main process
- React 18 + Redux Toolkit + Ant Design frontend
- Craco (CRA override) + Webpack build system
- 39 renderer files that import directly from `'electron'`
- 101 renderer files that import Node.js APIs (`fs`, `path`, `os`)
- node-pty native module for terminal

## Architecture: Why It's Harder

### The nodeIntegration Problem

Monokle uses a **legacy Electron security model**:

```typescript
webPreferences: {
  contextIsolation: false,   // renderer and Node share a context
  nodeIntegration: true,     // renderer can require() Node modules
}
```

This means the renderer process (React app) **directly imports Node.js and Electron APIs**:

```typescript
// In a React component (src/components/organisms/TerminalPane/TerminalPane.tsx)
import {ipcRenderer} from 'electron';

// In a Redux reducer (src/redux/reducers/ui.ts)
import {webFrame} from 'electron';

// In shared utilities (src/shared/utils/shell.ts)
import {app, shell} from 'electron';
```

The colorpicker app uses the **modern pattern** — a preload script that exposes a limited `window.api` via `contextBridge`. The renderer never touches Electron directly. This maps cleanly to electron-bridge.

Monokle's renderer has **39 direct Electron imports** and **101 Node.js imports**. Every one of these is a compatibility surface.

### What the Renderer Imports

| API | Count | Usage |
|-----|-------|-------|
| `ipcRenderer` | 21 | Send/invoke IPC to main, subscribe to events |
| `shell` | 17 | `shell.openExternal()` for links |
| `clipboard` | 2 | Read/write clipboard |
| `app` | 2 | `app.getPath()`, `app.getVersion()` |
| `webFrame` | 1 | `webFrame.setZoomFactor()` |
| `fs` | 34 | Direct filesystem access from renderer |
| `path` | 67 | Path manipulation in renderer |
| `os` | 2 | Platform detection |
| `process` | many | `process.env`, `process.platform`, `process.resourcesPath` |

### What the Main Process Uses

| API | Usage |
|-----|-------|
| `BrowserWindow` | Window creation with splash screen |
| `app` | Lifecycle, paths, version |
| `ipcMain` | Handle ~30 IPC channels |
| `dialog` | File open/save dialogs |
| `Menu` | Application menu |
| `globalShortcut` | Keyboard shortcuts |
| `nativeImage` | App icons |

## Process to Make Monokle Work with electron-bridge

### Phase A: Build System Adaptation

Monokle uses **Craco + Webpack** targeting `electron-renderer`. This webpack target assumes Node.js globals (`__dirname`, `process`, `require`) are available in the browser. For electron-bridge mode:

1. **Add a second webpack config** (or craco override) that targets `web` instead of `electron-renderer`
2. **Replace Node.js polyfills** — webpack 5 doesn't auto-polyfill Node.js modules. Add:
   - `path-browserify` for `path`
   - `process/browser` for `process`
   - `browserify-fs` or a custom abstraction for `fs` (see Phase C)
3. **Conditional build flag** — `ELECTRON_BRIDGE=true` env var that switches the webpack target and polyfills

**Estimated effort:** Medium. The craco config needs a parallel mode, not a rewrite.

### Phase B: Electron API Abstraction Layer

Create an abstraction that the renderer imports instead of `'electron'` directly.

**Option 1: Module alias (recommended)**

Create `src/platform/electron-api.ts`:
```typescript
// When running in Electron:
export { ipcRenderer, shell, clipboard, app } from 'electron';

// When running in electron-bridge (browser):
// These would be provided by the bridge's renderer bundle
```

Then update all 39 import sites from `from 'electron'` to `from '@platform/electron-api'`. The webpack/craco config aliases this differently per build target.

**Option 2: Runtime detection**

```typescript
const isElectron = typeof process !== 'undefined' && process.versions?.electron;
export const shell = isElectron
  ? require('electron').shell
  : { openExternal: (url: string) => window.open(url, '_blank') };
```

**What each API needs:**

| Renderer API | Bridge Replacement |
|---|---|
| `ipcRenderer.send/on` | electron-bridge's WebSocket-based ipcRenderer (already works) |
| `ipcRenderer.invoke` | electron-bridge's invoke (already works) |
| `shell.openExternal(url)` | `window.open(url, '_blank')` |
| `clipboard.readText/writeText` | `navigator.clipboard.readText/writeText` |
| `app.getPath(name)` | IPC call to main process (bridge's `app.getPath()` runs server-side) |
| `app.getVersion()` | IPC call or injected constant |
| `webFrame.setZoomFactor()` | `document.body.style.zoom` or CSS transform |

**Estimated effort:** Medium-low for the abstraction layer. 39 files to update, but it's a mechanical find-and-replace.

### Phase C: Filesystem Access (THE BIG ONE)

This is the hardest problem. Monokle's renderer directly reads and writes files:

```typescript
// In React components and Redux reducers:
import fs from 'fs';
const content = fs.readFileSync(filePath, 'utf-8');
fs.writeFileSync(outputPath, yaml);
```

**101 files** import `fs` or `path` in the renderer. This is core functionality — YAML file browsing, editing, saving, git operations.

**Options:**

1. **Move all fs operations to main process via IPC** (most correct, most work)
   - Create IPC channels: `fs:readFile`, `fs:writeFile`, `fs:readdir`, `fs:stat`, etc.
   - Replace 34 `fs` imports with async IPC calls
   - Requires rethinking synchronous `readFileSync` → async patterns
   - **This is essentially the migration Electron recommends anyway** (moving toward contextIsolation)

2. **Use the File System Access API** (browser-native, limited)
   - Only works for user-selected files
   - Can't scan directories freely
   - Incompatible with Monokle's "open project folder and scan everything" model

3. **Server-side filesystem proxy** (electron-bridge enhancement)
   - electron-bridge's main process (Node.js) already has fs access
   - Add a built-in `fs` IPC service that the renderer can call via WebSocket
   - Expose as `bridgeFs.readFile()`, `bridgeFs.writeFile()`, etc.
   - **This is the most practical approach for electron-bridge**

**Estimated effort:** High. This is the bulk of the migration work due to the volume of call sites and the sync→async conversion.

### Phase D: Node.js Globals

The renderer uses `process.env`, `process.platform`, `process.resourcesPath`, and `__dirname` extensively.

- `process.env` → Inject via webpack `DefinePlugin` or pass from main via IPC at startup
- `process.platform` → Hardcode or detect via `navigator.userAgent`
- `process.resourcesPath` → Serve resources via HTTP from the bridge server
- `__dirname` → Not meaningful in browser; replace with base URL

**Estimated effort:** Medium-low. Mostly mechanical once the abstraction exists.

### Phase E: Terminal (node-pty)

Monokle uses `node-pty` for local shell and pod exec. The terminal UI uses xterm.js (which already runs in the browser).

**For electron-bridge mode:**
- xterm.js continues to render in the browser (no change)
- node-pty continues to run on the Node.js server (no change)
- IPC channels (`shell.init`, `shell.incomingData.*`, `shell.ptyProcessWriteData`) flow over WebSocket instead of Electron IPC
- **This should mostly work out of the box** since electron-bridge already bridges IPC over WebSocket

**The pod terminal** (`@kubernetes/client-node`) runs in the main process and communicates via IPC — same story, should work.

**Estimated effort:** Low, assuming IPC bridge works correctly for streaming data.

### Phase F: Redux State Sync

Monokle has a custom Redux synchronization layer (`ipcMainRedux.ts` / `ipcRendererRedux.ts`) that syncs Redux state between main and renderer processes.

- Main process dispatches actions to renderer via `redux-dispatch` channel
- Renderer subscribes to state changes via `redux-subscribe`

**This is standard IPC** and should work over electron-bridge's WebSocket bridge without changes, as long as `ipcRenderer.send/on` works (which it does).

**Estimated effort:** Low.

### Phase G: Main Process Compatibility

The main process (58 TypeScript files) uses standard Electron APIs that electron-bridge covers or stubs:

| API | electron-bridge Status |
|-----|----------------------|
| `app` lifecycle | Covered |
| `BrowserWindow` | Covered (most methods) |
| `ipcMain` | Covered |
| `dialog` | Covered (needs client-side rendering) |
| `Menu` | Covered (needs click round-tripping — Phase 2 of main plan) |
| `globalShortcut` | Stubbed (no browser equivalent) |
| `nativeImage` | Covered (basic) |
| `electron-store` | Needs shim (uses `conf` under the hood — fs-based, will work on Node) |
| `electron-log` | Needs shim (replace with `console` or `loglevel`) |
| `electron-updater` | Stubbed (no browser equivalent) |
| `@trodi/electron-splashscreen` | Needs shim (render splash in browser) |
| `electron-reload` | Not needed (use webpack HMR) |

**Estimated effort:** Medium. Most is covered, but electron-store, electron-log, and splashscreen need shims.

### Phase H: Build Output Serving

Monokle's CRA build outputs to `build/` with `index.html` + `bundle.*.js`. electron-bridge needs to:
- Serve `build/` as the static directory
- Inject bridge scripts into `build/index.html`
- Handle the webpack chunk loading (public path configuration)

The CLI launcher (`node dist/cli.cjs ./monokle`) would need to be aware of the CRA output structure.

**Estimated effort:** Low-medium. Mostly configuration.

## Effort Summary

| Phase | Description | Effort | Files Affected |
|-------|-------------|--------|----------------|
| A | Build system dual-target | Medium | craco.config.js, 2-3 new configs |
| B | Electron API abstraction | Medium-low | 39 renderer files |
| C | Filesystem proxy | **High** | 34+ renderer files, new IPC service |
| D | Node.js globals | Medium-low | 15-20 files |
| E | Terminal (node-pty) | Low | Should work via existing IPC bridge |
| F | Redux sync | Low | Should work via existing IPC bridge |
| G | Main process compat | Medium | electron-bridge stubs/shims |
| H | Build output serving | Low-medium | CLI + server config |

## Key Differences from Colorpicker

| Dimension | Colorpicker | Monokle |
|-----------|------------|---------|
| Renderer Electron imports | 0 (uses preload) | 39 (direct imports) |
| Renderer Node.js imports | 0 | 101 |
| Context isolation | Yes (modern) | No (legacy) |
| Build system | None (static HTML) | Craco + Webpack |
| Framework | Vanilla JS | React 18 + Redux |
| IPC pattern | send/on only | send/on + invoke/handle + Redux sync |
| Native modules | robotjs (optional) | node-pty (core feature) |
| Filesystem access | None in renderer | 34 files with direct `fs` calls |

## Recommended Migration Order

1. **Phase B first** — Abstract Electron imports. This is mechanical and unblocks everything.
2. **Phase A** — Dual build target. Needed to test in browser.
3. **Phase G** — Main process compatibility. Extend electron-bridge stubs.
4. **Phase C** — Filesystem proxy. The hard one. Start with read-only operations.
5. **Phase D** — Node.js globals. Quick wins.
6. **Phase E+F** — Terminal + Redux. These should mostly work already.
7. **Phase H** — Build output serving. Final integration.

## What Would Work Today (Without Changes)

If you ran `node dist/cli.cjs ./monokle` right now:
- The main process would start (most Electron APIs are covered/stubbed)
- The Craco/webpack build output wouldn't be served correctly (needs build first + static dir config)
- Even if served, the React app would crash immediately because `require('fs')` doesn't exist in the browser

## What electron-bridge Needs to Improve

Based on this analysis, electron-bridge should add:

1. **Filesystem IPC service** — A built-in `fs` proxy so renderers can do async file operations via WebSocket. This is the #1 gap for any non-trivial Electron app.
2. **`electron-store` shim** — Common Electron ecosystem package.
3. **`electron-log` shim** — Common Electron ecosystem package.
4. **Webpack target awareness** — Documentation or helpers for apps that need to switch from `electron-renderer` to `web` target.
5. **`process` and `__dirname` injection** — Auto-inject browser-safe versions of common Node globals.
