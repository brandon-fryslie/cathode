/** Pixel rectangle */
export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/** Pixel point */
export interface Point {
  x: number
  y: number
}

/** Pixel dimensions */
export interface Size {
  width: number
  height: number
}

/** Display info (maps to Electron's Display) */
export interface Display {
  id: number
  bounds: Rectangle
  workArea: Rectangle
  scaleFactor: number
  rotation: number
  size: Size
  workAreaSize: Size
}

/** Subset of Electron's BrowserWindowConstructorOptions that map to web */
export interface BrowserWindowConstructorOptions {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  x?: number
  y?: number
  title?: string
  show?: boolean
  backgroundColor?: string
  parent?: number // window ID (not BrowserWindow ref — avoids circular dep)
  modal?: boolean
  resizable?: boolean
  minimizable?: boolean
  maximizable?: boolean
  closable?: boolean
  fullscreen?: boolean
  fullscreenable?: boolean
  alwaysOnTop?: boolean
  // Accepted but no-op in browser mode
  frame?: boolean
  transparent?: boolean
  hasShadow?: boolean
  autoHideMenuBar?: boolean
  movable?: boolean
  focusable?: boolean
  icon?: string
  skipTaskbar?: boolean
  kiosk?: boolean
  webPreferences?: WebPreferences
}

export interface WebPreferences {
  preload?: string
  contextIsolation?: boolean
  nodeIntegration?: boolean
}

/** File filter for dialogs */
export interface FileFilter {
  name: string
  extensions: string[]
}

/** Options for showOpenDialog */
export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: FileFilter[]
  properties?: Array<
    'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory'
  >
  message?: string
}

/** Result from showOpenDialog */
export interface OpenDialogReturnValue {
  canceled: boolean
  filePaths: string[]
}

/** Options for showSaveDialog */
export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: FileFilter[]
  message?: string
  nameFieldLabel?: string
  showsTagField?: boolean
}

/** Result from showSaveDialog */
export interface SaveDialogReturnValue {
  canceled: boolean
  filePath: string | undefined
}

/** Options for showMessageBox */
export interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning'
  buttons?: string[]
  defaultId?: number
  title?: string
  message: string
  detail?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
  cancelId?: number
}

/** Result from showMessageBox */
export interface MessageBoxReturnValue {
  response: number
  checkboxChecked: boolean
}

/** Serializable representation of fs.Stats (methods converted to boolean fields) */
export interface SerializedStats {
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  atimeMs: number
  mode: number
}

/** Serializable representation of fs.Dirent */
export interface SerializedDirent {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

/** Menu item constructor options (matches Electron's) */
export interface MenuItemConstructorOptions {
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  role?: string
  accelerator?: string
  enabled?: boolean
  visible?: boolean
  checked?: boolean
  id?: string
  click?: (menuItem: unknown, browserWindow: unknown, event: unknown) => void
  submenu?: MenuItemConstructorOptions[]
}
