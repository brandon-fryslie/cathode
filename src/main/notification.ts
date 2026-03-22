import { EventEmitter } from 'node:events'
import type { BridgeServer } from './server.js'

let _server: BridgeServer | null = null

/** @internal */
export function _initNotification(server: BridgeServer): void {
  _server = server
}

export class Notification extends EventEmitter {
  title: string
  body: string
  silent: boolean

  constructor(options: { title?: string; body?: string; silent?: boolean } = {}) {
    super()
    this.title = options.title ?? ''
    this.body = options.body ?? ''
    this.silent = options.silent ?? false
  }

  show(): void {
    // Send to client to use Web Notifications API
    _server?.broadcast({
      type: 'window:command',
      windowId: 0,
      command: 'showNotification',
      args: [{ title: this.title, body: this.body, silent: this.silent }],
    })
    this.emit('show')
  }

  close(): void {
    this.emit('close')
  }

  static isSupported(): boolean {
    return true // Web Notifications are widely supported
  }
}
