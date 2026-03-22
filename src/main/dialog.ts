import type { BridgeServer } from './server.js'
import type {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
  MessageBoxOptions,
  MessageBoxReturnValue,
} from '../shared/types.js'

let _server: BridgeServer | null = null
let _requestId = 0
const _pendingRequests = new Map<string, { resolve: (v: unknown) => void }>()

/** @internal Set the server reference and wire up dialog responses */
export function _initDialog(server: BridgeServer): void {
  _server = server
}

/** @internal Handle dialog responses from the client */
export function _handleDialogResponse(id: string, result: unknown): void {
  const pending = _pendingRequests.get(id)
  if (pending) {
    _pendingRequests.delete(id)
    pending.resolve(result)
  }
}

function sendDialogRequest(method: string, options: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const id = String(++_requestId)
    _pendingRequests.set(id, { resolve })
    // Send to all connected clients (the active window will handle it)
    _server?.broadcast({
      type: 'dialog:request',
      id,
      method,
      options,
    })
  })
}

export const dialog = {
  async showOpenDialog(options: OpenDialogOptions = {}): Promise<OpenDialogReturnValue> {
    const result = await sendDialogRequest('showOpenDialog', options)
    return (result as OpenDialogReturnValue) ?? { canceled: true, filePaths: [] }
  },

  async showSaveDialog(options: SaveDialogOptions = {}): Promise<SaveDialogReturnValue> {
    const result = await sendDialogRequest('showSaveDialog', options)
    return (result as SaveDialogReturnValue) ?? { canceled: true, filePath: undefined }
  },

  async showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
    const result = await sendDialogRequest('showMessageBox', options)
    return (result as MessageBoxReturnValue) ?? { response: 0, checkboxChecked: false }
  },

  showErrorBox(title: string, content: string): void {
    console.error(`[electron-bridge] Error: ${title}\n${content}`)
    // Also send to client for display
    _server?.broadcast({
      type: 'dialog:request',
      id: String(++_requestId), // fire-and-forget
      method: 'showErrorBox',
      options: { title, content },
    })
  },
}
