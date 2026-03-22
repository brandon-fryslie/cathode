import type { BridgeServer } from './server.js'

let _server: BridgeServer | null = null

/** @internal Set the server reference */
export function _setShellServer(server: BridgeServer): void {
  _server = server
}

export const shell = {
  /** Open a URL in the user's default browser. In web mode, sends WS command to client. */
  async openExternal(url: string): Promise<void> {
    // If we have connected clients, tell them to open the URL
    _server?.broadcast({
      type: 'window:command',
      windowId: 0, // broadcast target
      command: 'openExternal',
      args: [url],
    })
  },

  async openPath(_path: string): Promise<string> {
    console.warn('[electron-bridge] shell.openPath() is not available in web mode')
    return ''
  },

  showItemInFolder(_fullPath: string): void {
    console.warn('[electron-bridge] shell.showItemInFolder() is not available in web mode')
  },

  async trashItem(_path: string): Promise<void> {
    console.warn('[electron-bridge] shell.trashItem() is not available in web mode')
  },

  beep(): void {
    // Could potentially play an audio beep via the client
    console.warn('[electron-bridge] shell.beep() is not available in web mode')
  },

  readShortcutLink(_shortcutPath: string): Record<string, unknown> {
    console.warn('[electron-bridge] shell.readShortcutLink() is not available in web mode')
    return {}
  },

  writeShortcutLink(_shortcutPath: string, _options: unknown): boolean {
    console.warn('[electron-bridge] shell.writeShortcutLink() is not available in web mode')
    return false
  },
}
