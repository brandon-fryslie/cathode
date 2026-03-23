import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ElectronEvent } from '../shared/events.js'
import { BridgeServer } from './server.js'
import { createMessageRouter } from './message-router.js'
import { _initDialog } from './dialog.js'
import { _initMenu } from './menu.js'
import { _initFs } from './fs-service.js'
import { WindowManager } from './window-manager.js'
import type { BrowserWindow } from './browser-window.js'

// [LAW:dataflow-not-control-flow] Lifecycle events always fire in order.
// preventDefault on the event determines behavior, not whether events emit.

const PATH_NAMES: Record<string, () => string> = {
  home: () => homedir(),
  appData: () => process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : join(homedir(), '.config'),
  userData: () => join(PATH_NAMES.appData(), app.getName()),
  temp: () => tmpdir(),
  desktop: () => join(homedir(), 'Desktop'),
  documents: () => join(homedir(), 'Documents'),
  downloads: () => join(homedir(), 'Downloads'),
  music: () => join(homedir(), 'Music'),
  pictures: () => join(homedir(), 'Pictures'),
  videos: () => join(homedir(), 'Videos'),
  logs: () => join(PATH_NAMES.userData(), 'logs'),
  exe: () => process.execPath,
  module: () => process.execPath,
}

class App extends EventEmitter {
  private _ready = false
  private _readyPromise: Promise<void>
  private _resolveReady!: () => void
  private _server: BridgeServer
  private _name = ''
  private _version = ''
  private _quitting = false

  constructor() {
    super()
    this._readyPromise = new Promise(resolve => { this._resolveReady = resolve })

    const port = parseInt(process.env.ELECTRON_BRIDGE_PORT ?? '3000', 10)
    this._server = new BridgeServer(port)

    createMessageRouter(this._server)
    _initDialog(this._server)
    _initMenu(this._server)
    _initFs([process.cwd()])

    // Wire up window lifecycle events
    WindowManager.setOnWindowCreated((win: BrowserWindow) => {
      win._setServer(this._server)
      this.emit('web-contents-created', {}, win.webContents)
      this.emit('browser-window-created', {}, win)
    })

    WindowManager.setOnAllWindowsClosed(() => {
      this.emit('window-all-closed')
    })

    this._server.setClientReadyHandler((windowId) => {
      const win = WindowManager.getById(windowId)
      if (win) win.emit('ready-to-show')
    })

    this._server.setClientDisconnectHandler((windowId) => {
      // Client disconnected — could mean tab closed
      // Don't auto-destroy, let the app handle it
    })

    // Load package.json for name/version
    this._loadPackageInfo()

    // Auto-start: listen and emit ready on next tick
    queueMicrotask(() => this._start())
  }

  /** @internal Access the server (used by other modules) */
  get _bridgeServer(): BridgeServer { return this._server }

  private _loadRendererBundle(): void {
    // Find the renderer IIFE bundle relative to this module's directory.
    // In built mode (dist/index.cjs): __dirname = dist/
    // In source mode (src/main/app.ts): __dirname = src/main/
    const thisDir = typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url))

    const candidates = [
      resolve(thisDir, 'renderer', 'index.global.js'),          // dist/renderer/
      resolve(thisDir, '..', 'renderer', 'index.global.js'),    // dist/main/../renderer/
      resolve(thisDir, '..', 'dist', 'renderer', 'index.global.js'), // src/main/../../dist/renderer/
    ]

    for (const path of candidates) {
      try {
        const bundle = readFileSync(path, 'utf-8')
        this._server.setRendererBundle(bundle)
        return
      } catch { /* try next */ }
    }
    console.warn('[electron-bridge] Could not find renderer bundle — client-side bridge will not work')
  }

  private async _start(): Promise<void> {
    try {
      this._loadRendererBundle()
      await this._server.listen()
      this._ready = true
      this.emit('will-finish-launching')
      this.emit('ready', {}, {})
      this._resolveReady()
      console.log(`[electron-bridge] Server listening on http://localhost:${this._server.port}`)
    } catch (err) {
      console.error('[electron-bridge] Failed to start server:', err)
      process.exit(1)
    }
  }

  private _loadPackageInfo(): void {
    try {
      // Walk up from cwd to find package.json
      const pkgPath = resolve(process.cwd(), 'package.json')
      // Use dynamic import to avoid require in ESM
      import(pkgPath, { with: { type: 'json' } }).then(pkg => {
        this._name = this._name || pkg.default?.name || ''
        this._version = this._version || pkg.default?.version || ''
      }).catch(() => {
        // No package.json found — that's fine
      })
    } catch {
      // Ignore
    }
  }

  // --- Lifecycle ---

  whenReady(): Promise<void> { return this._readyPromise }
  isReady(): boolean { return this._ready }

  quit(): void {
    if (this._quitting) return
    this._quitting = true

    // [LAW:dataflow-not-control-flow] All events fire unconditionally.
    // The event's defaultPrevented flag determines what happens.
    const beforeQuit = new ElectronEvent()
    this.emit('before-quit', beforeQuit)

    // Close all windows
    for (const win of WindowManager.getAllWindows()) {
      win.close()
    }

    const willQuit = new ElectronEvent()
    this.emit('will-quit', willQuit)

    if (willQuit.defaultPrevented) {
      this._quitting = false
      return
    }

    this.emit('quit', {}, 0)
    this._server.close().then(() => process.exit(0))
  }

  exit(exitCode = 0): void {
    this._server.close().then(() => process.exit(exitCode))
  }

  // --- App Info ---

  getName(): string { return this._name }
  setName(name: string): void { this._name = name }

  getVersion(): string { return this._version }

  getPath(name: string): string {
    const getter = PATH_NAMES[name]
    if (!getter) throw new Error(`Failed to get path '${name}'`)
    return getter()
  }

  getLocale(): string {
    return Intl.DateTimeFormat().resolvedOptions().locale
  }

  getSystemLocale(): string {
    return this.getLocale()
  }

  getAppPath(): string {
    return process.cwd()
  }

  isPackaged: boolean = false

  setAppUserModelId(_id: string): void { /* no-op in browser */ }
  disableHardwareAcceleration(): void { /* no-op in browser */ }
  commandLine = {
    appendSwitch: (_key: string, _value?: string): void => {},
    appendArgument: (_value: string): void => {},
    hasSwitch: (_key: string): boolean => false,
    getSwitchValue: (_key: string): string => '',
  }

  // --- Focus ---

  focus(): void {
    const win = WindowManager.getFocusedWindow()
    win?.focus()
  }

  hide(): void { /* browser tabs can't be hidden programmatically */ }
  show(): void { /* browser tabs can't be shown programmatically */ }

  // --- Misc ---

  getGPUFeatureStatus(): Record<string, string> {
    return {} // Not available in web mode
  }

  setBadgeCount(count: number): boolean {
    // Could use Badging API in the future
    return false
  }

  getBadgeCount(): number { return 0 }

  requestSingleInstanceLock(): boolean {
    // No cross-tab lock mechanism — always succeeds
    return true
  }

  releaseSingleInstanceLock(): void { /* no-op */ }

  relaunch(): void {
    console.warn('[electron-bridge] app.relaunch() is not supported in web mode')
  }

  dock = {
    show: () => Promise.resolve(),
    hide: () => Promise.resolve(),
    isVisible: () => true,
    setMenu: () => {},
    getMenu: () => null,
    setIcon: () => {},
    bounce: () => 0,
    cancelBounce: () => {},
    setBadge: () => {},
    getBadge: () => '',
  }
}

export const app = new App()
