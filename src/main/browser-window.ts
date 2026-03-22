import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import type { BrowserWindowConstructorOptions, Rectangle, Size } from '../shared/types.js'
import { ElectronEvent } from '../shared/events.js'
import type { BridgeServer } from './server.js'
import { WebContents } from './web-contents.js'
import { WindowManager } from './window-manager.js'

/** Server-side BrowserWindow — manages state, syncs to browser client via WebSocket */
export class BrowserWindow extends EventEmitter {
  readonly id: number
  readonly webContents: WebContents
  private _bounds: Rectangle
  private _title: string
  private _visible: boolean
  private _minimized = false
  private _maximized = false
  private _fullscreen: boolean
  private _closable: boolean
  private _resizable: boolean
  private _destroyed = false
  private _minSize: [number, number]
  private _options: BrowserWindowConstructorOptions
  private _preloadSource: string | null = null
  private _server: BridgeServer | null = null
  private _pendingRoute: import('./server.js').WindowRoute | null = null
  private _pendingStaticDirs: string[] = []

  constructor(options: BrowserWindowConstructorOptions = {}) {
    super()
    this.id = WindowManager.nextId()
    this._options = options
    this._bounds = {
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width ?? 800,
      height: options.height ?? 600,
    }
    this._title = options.title ?? ''
    this._visible = options.show !== false
    this._fullscreen = options.fullscreen ?? false
    this._closable = options.closable !== false
    this._resizable = options.resizable !== false
    this._minSize = [options.minWidth ?? 0, options.minHeight ?? 0]
    this.webContents = new WebContents(this.id)

    // Read preload script source if specified
    if (options.webPreferences?.preload) {
      try {
        const preloadPath = resolve(options.webPreferences.preload)
        this._preloadSource = readFileSync(preloadPath, 'utf-8')
      } catch {
        console.warn(`[electron-bridge] Could not read preload script: ${options.webPreferences.preload}`)
      }
    }

    // Defer registration so app.ts can inject the server reference
    queueMicrotask(() => this._register())
  }

  /** @internal Set the server reference (called by app during init) */
  _setServer(server: BridgeServer): void {
    this._server = server
    this.webContents._setServer(server)

    // Apply any pending static dirs from loadFile calls before server was ready
    for (const dir of this._pendingStaticDirs) {
      server.addStaticDir(dir)
    }
    this._pendingStaticDirs = []

    // Apply pending route or register a default one
    const route = this._pendingRoute ?? {
      windowId: this.id,
      title: this._title,
      preloadSource: this._preloadSource ?? undefined,
    }
    server.setRoute(route)
    this._pendingRoute = null
  }

  private _register(): void {
    WindowManager.register(this)
  }

  private _sendCommand(command: string, ...args: unknown[]): void {
    this._server?.sendToWindow(this.id, {
      type: 'window:command',
      windowId: this.id,
      command,
      args,
    })
  }

  // --- Content Loading ---

  loadURL(url: string): Promise<void> {
    // Handle file:// URLs by converting to loadFile behavior
    if (url.startsWith('file://')) {
      const filePath = url.slice('file://'.length)
      return this.loadFile(filePath)
    }

    this.webContents._setURL(url)
    const route = { windowId: this.id, title: this._title, contentUrl: url, preloadSource: this._preloadSource ?? undefined }
    if (this._server) {
      this._server.setRoute(route)
    } else {
      this._pendingRoute = route
    }
    this._sendCommand('loadURL', url)
    queueMicrotask(() => this.webContents._finishLoad())
    return Promise.resolve()
  }

  loadFile(filePath: string): Promise<void> {
    const absolute = resolve(filePath)
    const staticDir = dirname(absolute)
    const fileName = filePath.replace(/\\/g, '/')
    const route = { windowId: this.id, title: this._title, contentPath: fileName, preloadSource: this._preloadSource ?? undefined }

    if (this._server) {
      this._server.addStaticDir(staticDir)
      this._server.setRoute(route)
    } else {
      // Server not yet wired — queue for _setServer
      this._pendingStaticDirs.push(staticDir)
      this._pendingRoute = route
    }

    this.webContents._setURL(`file://${absolute}`)
    this._sendCommand('loadFile', fileName)
    queueMicrotask(() => this.webContents._finishLoad())
    return Promise.resolve()
  }

  // --- Window State ---

  getTitle(): string { return this._title }
  setTitle(title: string): void {
    this._title = title
    this.webContents._setTitle(title)
    this._sendCommand('setTitle', title)
  }

  getBounds(): Rectangle { return { ...this._bounds } }
  setBounds(bounds: Partial<Rectangle>): void {
    Object.assign(this._bounds, bounds)
    // Browser tabs can't be resized programmatically — state update only
    this._sendCommand('setBounds', this._bounds)
  }

  getSize(): [number, number] { return [this._bounds.width, this._bounds.height] }
  setSize(width: number, height: number): void {
    this._bounds.width = width
    this._bounds.height = height
    this._sendCommand('setSize', width, height)
  }

  getPosition(): [number, number] { return [this._bounds.x, this._bounds.y] }
  setPosition(x: number, y: number): void {
    this._bounds.x = x
    this._bounds.y = y
  }

  getContentBounds(): Rectangle { return this.getBounds() }
  getContentSize(): [number, number] { return this.getSize() }
  setContentSize(width: number, height: number): void { this.setSize(width, height) }
  setContentBounds(bounds: Rectangle): void { this.setBounds(bounds) }

  // --- Visibility ---

  show(): void {
    this._visible = true
    this._sendCommand('show')
    this.emit('show')
  }

  hide(): void {
    this._visible = false
    this._sendCommand('hide')
    this.emit('hide')
  }

  isVisible(): boolean { return this._visible }

  minimize(): void {
    this._minimized = true
    this._sendCommand('minimize')
    this.emit('minimize')
  }

  restore(): void {
    this._minimized = false
    this._maximized = false
    this._sendCommand('restore')
    this.emit('restore')
  }

  isMinimized(): boolean { return this._minimized }

  maximize(): void {
    this._maximized = true
    this._sendCommand('maximize')
    this.emit('maximize')
  }

  unmaximize(): void {
    this._maximized = false
    this._sendCommand('unmaximize')
    this.emit('unmaximize')
  }

  isMaximized(): boolean { return this._maximized }

  setFullScreen(flag: boolean): void {
    this._fullscreen = flag
    this._sendCommand('setFullScreen', flag)
    this.emit('enter-full-screen')
  }

  isFullScreen(): boolean { return this._fullscreen }

  // --- Focus ---

  focus(): void {
    WindowManager.setFocused(this.id)
    this._sendCommand('focus')
    this.emit('focus')
  }

  blur(): void {
    this._sendCommand('blur')
    this.emit('blur')
  }

  isFocused(): boolean { return WindowManager.getFocusedWindow()?.id === this.id }

  // --- Lifecycle ---

  close(): void {
    const event = new ElectronEvent()
    this.emit('close', event)
    if (event.defaultPrevented) return
    this.destroy()
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._server?.removeRoute(this.id)
    WindowManager.unregister(this.id)
    this._sendCommand('close')
    this.emit('closed')
    this.removeAllListeners()
  }

  isDestroyed(): boolean { return this._destroyed }

  // --- Properties ---

  setResizable(resizable: boolean): void { this._resizable = resizable }
  isResizable(): boolean { return this._resizable }
  setClosable(closable: boolean): void { this._closable = closable }
  isClosable(): boolean { return this._closable }
  setAlwaysOnTop(_flag: boolean): void { /* browser limitation — no-op */ }
  isAlwaysOnTop(): boolean { return false }
  setBackgroundColor(color: string): void { this._sendCommand('setBackgroundColor', color) }

  center(): void {
    // Can't center a browser tab — no-op, update state
    this._bounds.x = 0
    this._bounds.y = 0
  }

  setMinimumSize(width: number, height: number): void { this._minSize = [width, height] }
  getMinimumSize(): [number, number] { return [...this._minSize] }
  setMaximumSize(_width: number, _height: number): void { /* no-op in browser */ }
  getMaximumSize(): [number, number] { return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] }

  setTouchBar(_touchBar: unknown): void { /* no-op — no TouchBar in browser */ }
  setMenu(_menu: unknown): void { /* no-op — per-window menus not supported in browser */ }

  // --- Static Methods ---

  static getAllWindows(): BrowserWindow[] { return WindowManager.getAllWindows() }
  static getFocusedWindow(): BrowserWindow | null { return WindowManager.getFocusedWindow() }
  static fromId(id: number): BrowserWindow | null { return WindowManager.getById(id) }
}
