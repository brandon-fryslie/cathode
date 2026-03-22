import { BrowserEventEmitter, ElectronEvent } from '../shared/events.js'
import type { ServerMessage } from '../shared/protocol.js'
import { BridgeConnection, detectWindowId } from './connection.js'

export interface IpcRendererEvent extends ElectronEvent {
  /** Ports transferred with the message (empty in bridge — no MessagePort over WS) */
  readonly ports: readonly never[]
}

// [LAW:dataflow-not-control-flow] Message handler lookup table — every message type
// has a handler, variability is in the data, not whether we handle it.
type MessageHandlers = {
  [K in ServerMessage['type']]: (msg: Extract<ServerMessage, { type: K }>) => void
}

class IpcRendererImpl extends BrowserEventEmitter {
  private _connection: BridgeConnection | null = null
  private _pendingInvokes = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private _idCounter = 0
  private _handlers: MessageHandlers

  constructor() {
    super()
    this._handlers = {
      'ipc:message': (msg) => {
        const event = Object.assign(new ElectronEvent(), { ports: [] as const })
        this.emit(msg.channel, event, ...msg.args)
      },
      'ipc:invoke:result': (msg) => {
        const pending = this._pendingInvokes.get(msg.id)
        if (!pending) return
        this._pendingInvokes.delete(msg.id)
        if (msg.error !== undefined) {
          pending.reject(new Error(msg.error))
        } else {
          pending.resolve(msg.result)
        }
      },
      'dialog:request': () => {
        // Handled by dialog-ui module when loaded
      },
      'window:command': () => {
        // Handled by window command module when loaded
      },
      'menu:set': () => {
        // Handled by menu-ui module when loaded
      },
      'menu:popup': () => {
        // Handled by menu-ui module when loaded
      },
      'app:event': () => {
        // Handled by app event module when loaded
      },
    }
  }

  /** @internal Initialize the WebSocket connection. Called once on import. */
  _init(): void {
    if (this._connection) return
    const windowId = detectWindowId()
    this._connection = new BridgeConnection(windowId, (msg) => {
      const handler = this._handlers[msg.type] as ((msg: ServerMessage) => void)
      handler(msg)
    })
  }

  /** @internal Replace a message handler (used by dialog-ui, menu-ui, etc.) */
  _setHandler<K extends ServerMessage['type']>(type: K, handler: (msg: Extract<ServerMessage, { type: K }>) => void): void {
    this._handlers[type] = handler as MessageHandlers[K]
  }

  /** @internal Access the connection for direct sends */
  get _conn(): BridgeConnection | null { return this._connection }

  send(channel: string, ...args: unknown[]): void {
    this._connection?.send({
      type: 'ipc:send',
      channel,
      args,
      windowId: this._connection.windowId,
    })
  }

  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = String(++this._idCounter)
      this._pendingInvokes.set(id, { resolve, reject })
      this._connection?.send({
        type: 'ipc:invoke',
        id,
        channel,
        args,
        windowId: this._connection?.windowId ?? 1,
      })
    })
  }

  sendSync(_channel: string, ..._args: unknown[]): never {
    throw new Error(
      '[electron-bridge] ipcRenderer.sendSync() is not supported in web mode. ' +
      'Use ipcRenderer.invoke() instead (recommended by Electron docs as well).'
    )
  }

  postMessage(channel: string, message: unknown, _transfer?: unknown[]): void {
    // MessagePort transfer not supported over WebSocket — send as regular message
    this.send(channel, message)
  }

  sendToHost(channel: string, ...args: unknown[]): void {
    // No webview in browser — treat same as send
    this.send(channel, ...args)
  }
}

export const ipcRenderer = new IpcRendererImpl()
