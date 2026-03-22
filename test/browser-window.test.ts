import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BrowserWindow } from '../src/main/browser-window.js'
import { WindowManager } from '../src/main/window-manager.js'

describe('BrowserWindow', () => {
  let win: BrowserWindow

  // Wait for queueMicrotask registration
  async function createWindow(opts = {}): Promise<BrowserWindow> {
    const w = new BrowserWindow(opts)
    await new Promise(resolve => queueMicrotask(resolve))
    return w
  }

  afterEach(async () => {
    // Clean up all windows
    for (const w of BrowserWindow.getAllWindows()) {
      w.destroy()
    }
    // Let microtasks settle
    await new Promise(resolve => queueMicrotask(resolve))
  })

  describe('constructor', () => {
    it('creates a window with default dimensions', async () => {
      win = await createWindow()
      expect(win.getSize()).toEqual([800, 600])
      expect(win.getPosition()).toEqual([0, 0])
    })

    it('accepts custom dimensions', async () => {
      win = await createWindow({ width: 1024, height: 768, x: 100, y: 50 })
      expect(win.getSize()).toEqual([1024, 768])
      expect(win.getPosition()).toEqual([100, 50])
    })

    it('sets title from options', async () => {
      win = await createWindow({ title: 'Test App' })
      expect(win.getTitle()).toBe('Test App')
    })

    it('assigns unique IDs', async () => {
      const win1 = await createWindow()
      const win2 = await createWindow()
      expect(win1.id).not.toBe(win2.id)
    })

    it('has a webContents property', async () => {
      win = await createWindow()
      expect(win.webContents).toBeDefined()
      expect(win.webContents.id).toBe(win.id)
    })
  })

  describe('state', () => {
    it('setTitle/getTitle', async () => {
      win = await createWindow()
      win.setTitle('New Title')
      expect(win.getTitle()).toBe('New Title')
    })

    it('setBounds/getBounds', async () => {
      win = await createWindow()
      win.setBounds({ x: 10, y: 20, width: 400, height: 300 })
      expect(win.getBounds()).toEqual({ x: 10, y: 20, width: 400, height: 300 })
    })

    it('getBounds returns a copy', async () => {
      win = await createWindow()
      const bounds = win.getBounds()
      bounds.width = 999
      expect(win.getBounds().width).toBe(800) // unchanged
    })

    it('setSize/getSize', async () => {
      win = await createWindow()
      win.setSize(500, 400)
      expect(win.getSize()).toEqual([500, 400])
    })
  })

  describe('visibility', () => {
    it('is visible by default', async () => {
      win = await createWindow()
      expect(win.isVisible()).toBe(true)
    })

    it('can start hidden', async () => {
      win = await createWindow({ show: false })
      expect(win.isVisible()).toBe(false)
    })

    it('show/hide toggle visibility', async () => {
      win = await createWindow({ show: false })
      win.show()
      expect(win.isVisible()).toBe(true)
      win.hide()
      expect(win.isVisible()).toBe(false)
    })
  })

  describe('lifecycle', () => {
    it('emits close and closed events on destroy', async () => {
      win = await createWindow()
      const events: string[] = []
      win.on('close', () => events.push('close'))
      win.on('closed', () => events.push('closed'))
      win.close()
      expect(events).toEqual(['close', 'closed'])
      expect(win.isDestroyed()).toBe(true)
    })

    it('close can be prevented', async () => {
      win = await createWindow()
      win.on('close', (e: { preventDefault: () => void }) => e.preventDefault())
      win.close()
      expect(win.isDestroyed()).toBe(false)
    })

    it('destroy removes from WindowManager', async () => {
      win = await createWindow()
      const id = win.id
      expect(BrowserWindow.fromId(id)).toBe(win)
      win.destroy()
      expect(BrowserWindow.fromId(id)).toBeNull()
    })
  })

  describe('static methods', () => {
    it('getAllWindows returns all open windows', async () => {
      const win1 = await createWindow()
      const win2 = await createWindow()
      const all = BrowserWindow.getAllWindows()
      expect(all).toContain(win1)
      expect(all).toContain(win2)
    })

    it('getFocusedWindow returns the most recently created', async () => {
      await createWindow()
      const win2 = await createWindow()
      expect(BrowserWindow.getFocusedWindow()).toBe(win2)
    })

    it('fromId finds by ID', async () => {
      win = await createWindow()
      expect(BrowserWindow.fromId(win.id)).toBe(win)
    })
  })
})
