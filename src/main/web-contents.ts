import { EventEmitter } from 'node:events'
import type { BridgeServer } from './server.js'

/** Server-side representation of a window's web contents */
export class WebContents extends EventEmitter {
  readonly id: number
  private _windowId: number
  private _server: BridgeServer | null = null
  private _url = ''
  private _title = ''

  constructor(windowId: number) {
    super()
    this.id = windowId
    this._windowId = windowId
  }

  /** @internal Set the server reference (called by BrowserWindow after app init) */
  _setServer(server: BridgeServer): void {
    this._server = server
  }

  /** Send a message to the renderer process */
  send(channel: string, ...args: unknown[]): void {
    this._server?.sendToWindow(this._windowId, {
      type: 'ipc:message',
      channel,
      args,
    })
  }

  /** @internal Update the URL (called by BrowserWindow.loadURL/loadFile) */
  _setURL(url: string): void {
    this._url = url
    this.emit('did-start-navigation', {}, url, true)
    this.emit('did-navigate', {}, url)
  }

  /** @internal Mark navigation as finished */
  _finishLoad(): void {
    this.emit('did-finish-load')
    this.emit('dom-ready')
  }

  /** @internal Update the title */
  _setTitle(title: string): void {
    this._title = title
    this.emit('page-title-updated', {}, title)
  }

  getURL(): string { return this._url }
  getTitle(): string { return this._title }

  isLoading(): boolean { return false }
  isLoadingMainFrame(): boolean { return false }
  isWaitingForResponse(): boolean { return false }
  canGoBack(): boolean { return false }
  canGoForward(): boolean { return false }

  /** Execute JavaScript in the renderer (sends via WS, renderer evals) */
  executeJavaScript(code: string): Promise<unknown> {
    this._server?.sendToWindow(this._windowId, {
      type: 'window:command',
      windowId: this._windowId,
      command: 'executeJavaScript',
      args: [code],
    })
    // Can't get return value back synchronously — resolve void
    return Promise.resolve()
  }

  /** Open DevTools — in browser, this just logs since the user can F12 */
  openDevTools(): void {
    console.log('[electron-bridge] DevTools: use browser DevTools (F12)')
  }

  closeDevTools(): void { /* no-op */ }
  isDevToolsOpened(): boolean { return false }
  toggleDevTools(): void { this.openDevTools() }
}
