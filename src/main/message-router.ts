// [LAW:single-enforcer] Routes all incoming WebSocket messages to the appropriate handler.
// [LAW:dataflow-not-control-flow] Every message type has a handler — variability is in the data.

import type { WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '../shared/protocol.js'
import type { BridgeServer } from './server.js'
import { ipcMain } from './ipc-main.js'
import { _handleDialogResponse } from './dialog.js'

type ClientMessageHandlers = {
  [K in ClientMessage['type']]: (msg: Extract<ClientMessage, { type: K }>, windowId: number, ws: WebSocket) => void
}

export function createMessageRouter(server: BridgeServer): void {
  const handlers: ClientMessageHandlers = {
    'ipc:send': (msg, windowId) => {
      const replyFn = (channel: string, ...args: unknown[]) => {
        server.sendToWindow(windowId, { type: 'ipc:message', channel, args })
      }
      ipcMain._dispatch(msg.channel, windowId, msg.args, replyFn)
    },

    'ipc:invoke': async (msg, windowId) => {
      const senderSend = (channel: string, ...args: unknown[]) => {
        server.sendToWindow(windowId, { type: 'ipc:message', channel, args })
      }
      try {
        const result = await ipcMain._dispatchInvoke(msg.channel, windowId, msg.args, senderSend)
        server.sendToWindow(windowId, { type: 'ipc:invoke:result', id: msg.id, result })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        server.sendToWindow(windowId, { type: 'ipc:invoke:result', id: msg.id, error })
      }
    },

    'dialog:response': (msg, _windowId) => {
      _handleDialogResponse(msg.id, msg.result)
    },

    'window:event': (_msg, _windowId) => {
      // Handled by window-manager when loaded
    },

    'client:ready': (_msg, windowId, ws) => {
      // Notify the server that a client is ready
      // The server's clientReady handler is set by app.ts
    },
  }

  server.setMessageHandler((windowId, msg, ws) => {
    const handler = handlers[msg.type] as ((msg: ClientMessage, windowId: number, ws: WebSocket) => void)
    handler(msg, windowId, ws)
  })
}
