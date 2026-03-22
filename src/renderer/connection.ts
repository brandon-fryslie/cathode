import type { ClientMessage, ServerMessage } from '../shared/protocol.js'

export type ServerMessageHandler = (message: ServerMessage) => void

/**
 * Manages the WebSocket connection from the renderer (browser) to the server.
 * Auto-connects on creation, reconnects with exponential backoff.
 */
export class BridgeConnection {
  private _ws: WebSocket | null = null
  private _windowId: number
  private _url: string
  private _handler: ServerMessageHandler
  private _reconnectDelay = 250
  private _maxReconnectDelay = 8000
  private _closed = false
  private _readyPromise: Promise<void>
  private _resolveReady!: () => void

  constructor(windowId: number, handler: ServerMessageHandler) {
    this._windowId = windowId
    this._handler = handler

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    this._url = `${protocol}//${location.host}/__bridge/ws?windowId=${windowId}`

    this._readyPromise = new Promise(resolve => { this._resolveReady = resolve })
    this._connect()
  }

  get windowId(): number { return this._windowId }

  /** Resolves when the WebSocket is first connected */
  whenReady(): Promise<void> { return this._readyPromise }

  send(message: ClientMessage): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message))
    }
  }

  close(): void {
    this._closed = true
    this._ws?.close()
  }

  private _connect(): void {
    if (this._closed) return

    const ws = new WebSocket(this._url)
    this._ws = ws

    ws.onopen = () => {
      this._reconnectDelay = 250
      this.send({ type: 'client:ready', windowId: this._windowId })
      this._resolveReady()
    }

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string)
        this._handler(msg)
      } catch {
        // Invalid message — ignore
      }
    }

    ws.onclose = () => {
      if (this._closed) return
      setTimeout(() => this._connect(), this._reconnectDelay)
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay)
    }

    ws.onerror = () => {
      // onclose will fire after this, triggering reconnect
    }
  }
}

/** Detect the window ID from the page — set by the server shell HTML */
export function detectWindowId(): number {
  return (globalThis as Record<string, unknown>).__BRIDGE_WINDOW_ID__ as number ?? 1
}
