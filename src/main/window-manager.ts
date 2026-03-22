// [LAW:one-source-of-truth] Single registry for all BrowserWindow instances.

import type { BrowserWindow } from './browser-window.js'

let _nextId = 1
let _focusedId: number | null = null
const _windows = new Map<number, BrowserWindow>()

/** Callbacks set by app.ts to receive window lifecycle events */
let _onWindowCreated: ((win: BrowserWindow) => void) | null = null
let _onAllWindowsClosed: (() => void) | null = null

export const WindowManager = {
  nextId(): number {
    return _nextId++
  },

  register(win: BrowserWindow): void {
    _windows.set(win.id, win)
    _focusedId = win.id
    _onWindowCreated?.(win)
  },

  unregister(id: number): void {
    _windows.delete(id)
    if (_focusedId === id) {
      // Focus the most recent remaining window, or null
      const ids = [..._windows.keys()]
      _focusedId = ids.length > 0 ? ids[ids.length - 1] : null
    }
    if (_windows.size === 0) {
      _onAllWindowsClosed?.()
    }
  },

  getById(id: number): BrowserWindow | null {
    return _windows.get(id) ?? null
  },

  getAllWindows(): BrowserWindow[] {
    return [..._windows.values()]
  },

  getFocusedWindow(): BrowserWindow | null {
    return _focusedId !== null ? (_windows.get(_focusedId) ?? null) : null
  },

  setFocused(id: number): void {
    if (_windows.has(id)) _focusedId = id
  },

  get count(): number {
    return _windows.size
  },

  setOnWindowCreated(handler: (win: BrowserWindow) => void): void {
    _onWindowCreated = handler
  },

  setOnAllWindowsClosed(handler: () => void): void {
    _onAllWindowsClosed = handler
  },
}
