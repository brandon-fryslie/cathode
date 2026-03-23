// Main process API — server-side
export { app } from './app.js'
export { BrowserWindow } from './browser-window.js'
export { ipcMain } from './ipc-main.js'
export { WebContents } from './web-contents.js'
export { dialog } from './dialog.js'
export { Menu, MenuItem } from './menu.js'
export { shell } from './shell.js'
export { net } from './net.js'
export { clipboard } from './clipboard.js'
export { Notification } from './notification.js'
export { screen } from './screen.js'
export { nativeTheme } from './native-theme.js'
export { nativeImage, NativeImage } from './native-image.js'
export { session } from './session.js'
export { BridgeServer } from './server.js'
export { addFsRoot } from './fs-service.js'

// Tier 4 stubs
export {
  Tray,
  TouchBar,
  autoUpdater,
  safeStorage,
  crashReporter,
  globalShortcut,
  powerMonitor,
  powerSaveBlocker,
  contentTracing,
  systemPreferences,
  inAppPurchase,
  desktopCapturer,
} from './stubs.js'
