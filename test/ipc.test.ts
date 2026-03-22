import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ipcMain } from '../src/main/ipc-main.js'

describe('ipcMain', () => {
  afterEach(() => {
    ipcMain.removeAllListeners()
    // Clean up any registered handlers
    for (const channel of ['test-channel', 'ping', 'error-channel', 'once-channel']) {
      try { ipcMain.removeHandler(channel) } catch {}
    }
  })

  describe('on/emit (fire-and-forget)', () => {
    it('dispatches messages to listeners', () => {
      const received: unknown[] = []
      ipcMain.on('test-channel', (_event, ...args) => {
        received.push(args)
      })

      const replyFn = () => {}
      ipcMain._dispatch('test-channel', 1, ['hello', 42], replyFn)

      expect(received).toEqual([['hello', 42]])
    })

    it('provides a reply function on the event', () => {
      let replyArgs: unknown[] = []
      const replyFn = (channel: string, ...args: unknown[]) => {
        replyArgs = [channel, ...args]
      }

      ipcMain.on('test-channel', (event) => {
        event.reply('response-channel', 'pong')
      })

      ipcMain._dispatch('test-channel', 1, [], replyFn)
      expect(replyArgs).toEqual(['response-channel', 'pong'])
    })

    it('includes senderWindowId on the event', () => {
      let windowId: number | undefined
      ipcMain.on('test-channel', (event) => {
        windowId = (event as { senderWindowId: number }).senderWindowId
      })

      ipcMain._dispatch('test-channel', 42, [], () => {})
      expect(windowId).toBe(42)
    })
  })

  describe('handle/invoke', () => {
    it('handles invoke requests and returns results', async () => {
      ipcMain.handle('ping', async (_event, msg) => `pong:${msg}`)

      const result = await ipcMain._dispatchInvoke('ping', 1, ['hello'], () => {})
      expect(result).toBe('pong:hello')
    })

    it('handles synchronous return values', async () => {
      ipcMain.handle('ping', () => 'sync-pong')

      const result = await ipcMain._dispatchInvoke('ping', 1, [], () => {})
      expect(result).toBe('sync-pong')
    })

    it('rejects when no handler is registered', async () => {
      await expect(
        ipcMain._dispatchInvoke('nonexistent', 1, [], () => {})
      ).rejects.toThrow("No handler registered for 'nonexistent'")
    })

    it('throws when registering a duplicate handler', () => {
      ipcMain.handle('ping', () => 'a')
      expect(() => ipcMain.handle('ping', () => 'b')).toThrow(
        "Attempted to register a second handler for 'ping'"
      )
    })

    it('removeHandler allows re-registration', () => {
      ipcMain.handle('ping', () => 'a')
      ipcMain.removeHandler('ping')
      ipcMain.handle('ping', () => 'b') // should not throw
    })
  })

  describe('handleOnce', () => {
    it('handles one invoke then removes itself', async () => {
      ipcMain.handleOnce('once-channel', () => 'first')

      const result = await ipcMain._dispatchInvoke('once-channel', 1, [], () => {})
      expect(result).toBe('first')

      // Second invoke should fail
      await expect(
        ipcMain._dispatchInvoke('once-channel', 1, [], () => {})
      ).rejects.toThrow()
    })
  })
})
