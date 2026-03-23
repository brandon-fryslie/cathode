import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ipcMain } from '../src/main/ipc-main.js'
import { _initFs, addFsRoot } from '../src/main/fs-service.js'
import type { SerializedStats, SerializedDirent } from '../src/shared/types.js'

// Test fs service by directly invoking ipcMain handlers (no WebSocket needed)
async function invokeHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const event = { senderWindowId: 1, sender: { send: () => {} } }
  return ipcMain._dispatchInvoke(channel, 1, args, () => {})
}

const TEST_DIR = join(tmpdir(), 'electron-bridge-fs-test-' + Date.now())

describe('fs-service', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    _initFs([TEST_DIR])
  })

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  describe('readFile / writeFile', () => {
    it('writes and reads a file', async () => {
      const filePath = join(TEST_DIR, 'hello.txt')
      await invokeHandler('bridge:fs:writeFile', filePath, 'hello world')
      const content = await invokeHandler('bridge:fs:readFile', filePath, 'utf-8')
      expect(content).toBe('hello world')
    })

    it('reads binary as number array without encoding', async () => {
      const filePath = join(TEST_DIR, 'binary.bin')
      writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0xff]))
      const result = await invokeHandler('bridge:fs:readFile', filePath) as number[]
      expect(result).toEqual([0, 1, 2, 255])
    })

    it('rejects ENOENT for missing file', async () => {
      await expect(invokeHandler('bridge:fs:readFile', join(TEST_DIR, 'nope.txt'), 'utf-8'))
        .rejects.toThrow()
      try {
        await invokeHandler('bridge:fs:readFile', join(TEST_DIR, 'nope.txt'), 'utf-8')
      } catch (err) {
        const data = JSON.parse((err as Error).message)
        expect(data.code).toBe('ENOENT')
      }
    })
  })

  describe('stat / lstat', () => {
    it('returns serialized stats for a file', async () => {
      const filePath = join(TEST_DIR, 'stat-test.txt')
      writeFileSync(filePath, 'content')
      const stats = await invokeHandler('bridge:fs:stat', filePath) as SerializedStats
      expect(stats.isFile).toBe(true)
      expect(stats.isDirectory).toBe(false)
      expect(stats.size).toBeGreaterThan(0)
      expect(stats.mtimeMs).toBeGreaterThan(0)
    })

    it('returns serialized stats for a directory', async () => {
      const stats = await invokeHandler('bridge:fs:stat', TEST_DIR) as SerializedStats
      expect(stats.isDirectory).toBe(true)
      expect(stats.isFile).toBe(false)
    })

    it('lstat works', async () => {
      const filePath = join(TEST_DIR, 'stat-test.txt')
      const stats = await invokeHandler('bridge:fs:lstat', filePath) as SerializedStats
      expect(stats.isFile).toBe(true)
    })
  })

  describe('access', () => {
    it('resolves for existing file', async () => {
      const filePath = join(TEST_DIR, 'stat-test.txt')
      await expect(invokeHandler('bridge:fs:access', filePath)).resolves.toBeUndefined()
    })

    it('rejects for missing file', async () => {
      await expect(invokeHandler('bridge:fs:access', join(TEST_DIR, 'missing')))
        .rejects.toThrow()
    })
  })

  describe('readdir', () => {
    it('lists directory contents as strings', async () => {
      const dir = join(TEST_DIR, 'listdir')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'a.txt'), '')
      writeFileSync(join(dir, 'b.txt'), '')
      const result = await invokeHandler('bridge:fs:readdir', dir) as string[]
      expect(result).toContain('a.txt')
      expect(result).toContain('b.txt')
    })

    it('lists with withFileTypes', async () => {
      const dir = join(TEST_DIR, 'listdir')
      const result = await invokeHandler('bridge:fs:readdir', dir, { withFileTypes: true }) as SerializedDirent[]
      const aEntry = result.find(d => d.name === 'a.txt')
      expect(aEntry).toBeDefined()
      expect(aEntry!.isFile).toBe(true)
      expect(aEntry!.isDirectory).toBe(false)
    })
  })

  describe('mkdir / rm', () => {
    it('creates and removes a directory', async () => {
      const dir = join(TEST_DIR, 'newdir')
      await invokeHandler('bridge:fs:mkdir', dir)
      const stats = await invokeHandler('bridge:fs:stat', dir) as SerializedStats
      expect(stats.isDirectory).toBe(true)
      await invokeHandler('bridge:fs:rm', dir, { recursive: true })
    })

    it('creates recursive directories', async () => {
      const dir = join(TEST_DIR, 'a', 'b', 'c')
      await invokeHandler('bridge:fs:mkdir', dir, { recursive: true })
      const stats = await invokeHandler('bridge:fs:stat', dir) as SerializedStats
      expect(stats.isDirectory).toBe(true)
      await invokeHandler('bridge:fs:rm', join(TEST_DIR, 'a'), { recursive: true, force: true })
    })
  })

  describe('rename / copyFile / unlink', () => {
    it('renames a file', async () => {
      const src = join(TEST_DIR, 'rename-src.txt')
      const dest = join(TEST_DIR, 'rename-dest.txt')
      writeFileSync(src, 'rename me')
      await invokeHandler('bridge:fs:rename', src, dest)
      const content = await invokeHandler('bridge:fs:readFile', dest, 'utf-8')
      expect(content).toBe('rename me')
      expect(existsSync(src)).toBe(false)
    })

    it('copies a file', async () => {
      const src = join(TEST_DIR, 'rename-dest.txt')
      const dest = join(TEST_DIR, 'copy-dest.txt')
      await invokeHandler('bridge:fs:copyFile', src, dest)
      const content = await invokeHandler('bridge:fs:readFile', dest, 'utf-8')
      expect(content).toBe('rename me')
    })

    it('unlinks a file', async () => {
      const filePath = join(TEST_DIR, 'copy-dest.txt')
      await invokeHandler('bridge:fs:unlink', filePath)
      await expect(invokeHandler('bridge:fs:access', filePath)).rejects.toThrow()
    })
  })

  describe('appendFile / chmod / symlink / readlink / realpath / truncate', () => {
    it('appendFile appends to a file', async () => {
      const filePath = join(TEST_DIR, 'append-test.txt')
      writeFileSync(filePath, 'hello')
      await invokeHandler('bridge:fs:appendFile', filePath, ' world')
      const content = await invokeHandler('bridge:fs:readFile', filePath, 'utf-8')
      expect(content).toBe('hello world')
    })

    it('chmod changes permissions', async () => {
      const filePath = join(TEST_DIR, 'chmod-test.txt')
      writeFileSync(filePath, 'test')
      await expect(invokeHandler('bridge:fs:chmod', filePath, 0o644)).resolves.toBeUndefined()
    })

    it('symlink and readlink work', async () => {
      const target = join(TEST_DIR, 'sym-target.txt')
      const link = join(TEST_DIR, 'sym-link.txt')
      writeFileSync(target, 'target content')
      await invokeHandler('bridge:fs:symlink', target, link)
      const linkTarget = await invokeHandler('bridge:fs:readlink', link)
      expect(linkTarget).toBe(target)
    })

    it('realpath resolves path', async () => {
      const filePath = join(TEST_DIR, 'sym-target.txt')
      const resolved = await invokeHandler('bridge:fs:realpath', filePath)
      expect(typeof resolved).toBe('string')
      expect((resolved as string).length).toBeGreaterThan(0)
    })

    it('truncate shortens a file', async () => {
      const filePath = join(TEST_DIR, 'truncate-test.txt')
      writeFileSync(filePath, 'long content here')
      await invokeHandler('bridge:fs:truncate', filePath, 4)
      const content = await invokeHandler('bridge:fs:readFile', filePath, 'utf-8')
      expect(content).toBe('long')
    })
  })

  describe('path sandboxing', () => {
    it('rejects paths outside allowed roots', async () => {
      await expect(invokeHandler('bridge:fs:readFile', '/etc/passwd', 'utf-8'))
        .rejects.toThrow('Path outside allowed roots')
    })

    it('rejects traversal attempts', async () => {
      await expect(invokeHandler('bridge:fs:readFile', join(TEST_DIR, '..', '..', 'etc', 'passwd'), 'utf-8'))
        .rejects.toThrow('Path outside allowed roots')
    })

    it('rejects both paths in rename', async () => {
      await expect(invokeHandler('bridge:fs:rename', join(TEST_DIR, 'a.txt'), '/tmp/evil.txt'))
        .rejects.toThrow('Path outside allowed roots')
    })

    it('rejects both paths in copyFile', async () => {
      await expect(invokeHandler('bridge:fs:copyFile', '/etc/passwd', join(TEST_DIR, 'stolen.txt')))
        .rejects.toThrow('Path outside allowed roots')
    })
  })
})
