// Renderer process API — browser-side
export { ipcRenderer } from './ipc-renderer.js'
export { contextBridge } from './context-bridge.js'
export { BridgeConnection } from './connection.js'
export { bridgeFs, FsError } from './bridge-fs.js'

import { ipcRenderer } from './ipc-renderer.js'
import { contextBridge } from './context-bridge.js'
import { bridgeFs } from './bridge-fs.js'

// Auto-initialize when loaded as an inline script (IIFE build).
// The server injects window.__BRIDGE_WINDOW_ID__ before this script runs.
ipcRenderer._init()

// Expose renderer modules for preload scripts that do require('electron')
;(globalThis as Record<string, unknown>).__bridge_renderer__ = {
  ipcRenderer,
  contextBridge,
  bridgeFs,
}
