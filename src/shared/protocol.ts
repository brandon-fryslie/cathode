// [LAW:one-source-of-truth] This file is the canonical definition for all WebSocket messages.
// Server and client both derive their behavior from these types.

/** Messages sent from client (browser) to server (Node.js) */
export type ClientMessage =
  | IpcSendMessage
  | IpcInvokeMessage
  | DialogResponseMessage
  | WindowEventMessage
  | ClientReadyMessage

export interface IpcSendMessage {
  readonly type: 'ipc:send'
  readonly channel: string
  readonly args: readonly unknown[]
  readonly windowId: number
}

export interface IpcInvokeMessage {
  readonly type: 'ipc:invoke'
  readonly id: string
  readonly channel: string
  readonly args: readonly unknown[]
  readonly windowId: number
}

export interface DialogResponseMessage {
  readonly type: 'dialog:response'
  readonly id: string
  readonly result: unknown
}

export interface WindowEventMessage {
  readonly type: 'window:event'
  readonly windowId: number
  readonly event: string
  readonly data?: unknown
}

export interface ClientReadyMessage {
  readonly type: 'client:ready'
  readonly windowId: number
}

/** Messages sent from server (Node.js) to client (browser) */
export type ServerMessage =
  | IpcMessageOut
  | IpcInvokeResultMessage
  | DialogRequestMessage
  | WindowCommandMessage
  | MenuSetMessage
  | MenuPopupMessage
  | AppEventMessage

export interface IpcMessageOut {
  readonly type: 'ipc:message'
  readonly channel: string
  readonly args: readonly unknown[]
}

export interface IpcInvokeResultMessage {
  readonly type: 'ipc:invoke:result'
  readonly id: string
  readonly result?: unknown
  readonly error?: string
}

export interface DialogRequestMessage {
  readonly type: 'dialog:request'
  readonly id: string
  readonly method: string
  readonly options: unknown
}

export interface WindowCommandMessage {
  readonly type: 'window:command'
  readonly windowId: number
  readonly command: string
  readonly args: readonly unknown[]
}

export interface MenuSetMessage {
  readonly type: 'menu:set'
  readonly template: readonly SerializedMenuItem[]
}

export interface MenuPopupMessage {
  readonly type: 'menu:popup'
  readonly template: readonly SerializedMenuItem[]
  readonly position?: { x: number; y: number }
}

export interface AppEventMessage {
  readonly type: 'app:event'
  readonly event: string
  readonly data?: unknown
}

/** Serialized menu item for transmission over WebSocket */
export interface SerializedMenuItem {
  readonly label?: string
  readonly type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  readonly role?: string
  readonly accelerator?: string
  readonly enabled?: boolean
  readonly visible?: boolean
  readonly checked?: boolean
  readonly id?: string
  readonly submenu?: readonly SerializedMenuItem[]
}

/** Union of all protocol messages */
export type ProtocolMessage = ClientMessage | ServerMessage
