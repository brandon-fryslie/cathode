import { EventEmitter } from 'node:events'
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
  private _options: BrowserWindowConstructorOptions
  private _server: BridgeServer | null = null

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
    this.webContents = new WebContents(this.id)

    // Defer registration so app.ts can inject the server reference
    queueMicrotask(() => this._register())
  }

  /** @internal Set the server reference (called by app during init) */
  _setServer(server: BridgeServer): void {
    this._server = server
    this.webContents._setServer(server)

    // Register the HTTP route for this window
    server.setRoute({
      windowId: this.id,
      title: this._title,
    })
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
    this.webContents._setURL(url)
    const route = { windowId: this.id, title: this._title, contentUrl: url }
    this._server?.setRoute(route)
    this._sendCommand('loadURL', url)
    // Emit finish after a tick (client will actually navigate)
    queueMicrotask(() => this.webContents._finishLoad())
    return Promise.resolve()
  }

  loadFile(filePath: string): Promise<void> {
    const absolute = resolve(filePath)
    // Add the file's directory as a static serving dir
    this._server?.addStaticDir(dirname(absolute))

    const fileName = filePath.replace(/\\/g, '/')
    const route = { windowId: this.id, title: this._title, contentPath: fileName }
    this._server?.setRoute(route)
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

  // --- Static Methods ---

  static getAllWindows(): BrowserWindow[] { return WindowManager.getAllWindows() }
  static getFocusedWindow(): BrowserWindow | null { return WindowManager.getFocusedWindow() }
  static fromId(id: number): BrowserWindow | null { return WindowManager.getById(id) }
}
