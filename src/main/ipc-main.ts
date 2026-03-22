import { EventEmitter } from 'node:events'
import type { WebSocket } from 'ws'
import { ElectronEvent } from '../shared/events.js'

export interface IpcMainEvent extends ElectronEvent {
  /** The ID of the renderer window that sent this message */
  readonly senderWindowId: number
  /** Reply to the sender */
  reply: (channel: string, ...args: unknown[]) => void
  /** The underlying WebSocket (for advanced use) */
  readonly sender: { send: (channel: string, ...args: unknown[]) => void }
}

export interface IpcMainInvokeEvent {
  readonly senderWindowId: number
  readonly sender: { send: (channel: string, ...args: unknown[]) => void }
}

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown

class IpcMainImpl extends EventEmitter {
  private _handlers = new Map<string, InvokeHandler>()

  handle(channel: string, listener: InvokeHandler): void {
    if (this._handlers.has(channel)) {
      throw new Error(`Attempted to register a second handler for '${channel}'`)
    }
    this._handlers.set(channel, listener)
  }

  handleOnce(channel: string, listener: InvokeHandler): void {
    const wrapped: InvokeHandler = (...args) => {
      this.removeHandler(channel)
      return listener(...args)
    }
    this.handle(channel, wrapped)
  }

  removeHandler(channel: string): void {
    this._handlers.delete(channel)
  }

  /** @internal Dispatch a fire-and-forget message from a renderer */
  _dispatch(channel: string, windowId: number, args: readonly unknown[], replyFn: (channel: string, ...args: unknown[]) => void): void {
    const event: IpcMainEvent = Object.assign(new ElectronEvent(), {
      senderWindowId: windowId,
      reply: replyFn,
      sender: { send: replyFn },
    })
    this.emit(channel, event, ...args)
  }

  /** @internal Dispatch an invoke request, return the result or throw */
  async _dispatchInvoke(channel: string, windowId: number, args: readonly unknown[], senderSend: (channel: string, ...args: unknown[]) => void): Promise<unknown> {
    const handler = this._handlers.get(channel)
    if (!handler) {
      throw new Error(`No handler registered for '${channel}'`)
    }
    const event: IpcMainInvokeEvent = {
      senderWindowId: windowId,
      sender: { send: senderSend },
    }
    return handler(event, ...args)
  }
}

export const ipcMain = new IpcMainImpl()
