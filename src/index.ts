// Drop-in replacement for `require('electron')`
// Re-exports everything so `const { app, BrowserWindow, ipcMain } = require('electron-bridge')` works.
export * from './main/index.js'
