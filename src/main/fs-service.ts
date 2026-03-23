// [LAW:single-enforcer] Filesystem access validation happens in PathSandbox.
// This module registers ipcMain.handle() handlers for all fs operations.

import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import { ipcMain } from './ipc-main.js'
import { PathSandbox } from './fs-sandbox.js'
import type { SerializedStats, SerializedDirent } from '../shared/types.js'

const sandbox = new PathSandbox()

/** @internal Access the sandbox for the REST handler */
export function _getFsSandbox(): PathSandbox { return sandbox }

export function _initFs(roots: string[]): void {
  for (const root of roots) {
    sandbox.addRoot(root)
  }
  registerHandlers()
}

export function addFsRoot(root: string): void {
  sandbox.addRoot(root)
}

export function serializeStats(stats: fsSync.Stats): SerializedStats {
  return {
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymbolicLink: stats.isSymbolicLink(),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    birthtimeMs: stats.birthtimeMs,
    atimeMs: stats.atimeMs,
    mode: stats.mode,
  }
}

export function serializeDirent(dirent: fsSync.Dirent): SerializedDirent {
  return {
    name: dirent.name,
    isFile: dirent.isFile(),
    isDirectory: dirent.isDirectory(),
    isSymbolicLink: dirent.isSymbolicLink(),
  }
}

/** Wrap fs errors with structured JSON so the renderer can reconstruct them */
function wrapFsError(err: unknown): never {
  const e = err as NodeJS.ErrnoException
  throw new Error(JSON.stringify({
    code: e.code ?? 'UNKNOWN',
    message: e.message,
    path: e.path,
  }))
}

function registerHandlers(): void {
  ipcMain.handle('bridge:fs:readFile', async (_event, ...args) => {
    try {
      const [filePath, encoding] = args as [string, string?]
      const resolved = sandbox.validate(filePath)
      if (encoding) {
        return await fs.readFile(resolved, encoding as BufferEncoding)
      }
      const buffer = await fs.readFile(resolved)
      return Array.from(buffer)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:writeFile', async (_event, ...args) => {
    try {
      const [filePath, data, options] = args as [string, string, { encoding?: string; flag?: string }?]
      const resolved = sandbox.validate(filePath)
      const writeOptions: Record<string, unknown> = {}
      if (options?.encoding) writeOptions.encoding = options.encoding
      if (options?.flag) writeOptions.flag = options.flag
      await fs.writeFile(resolved, data, writeOptions as Parameters<typeof fs.writeFile>[2])
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:stat', async (_event, ...args) => {
    try {
      const [filePath] = args as [string]
      const resolved = sandbox.validate(filePath)
      return serializeStats(await fs.stat(resolved))
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:lstat', async (_event, ...args) => {
    try {
      const [filePath] = args as [string]
      const resolved = sandbox.validate(filePath)
      return serializeStats(await fs.lstat(resolved))
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:access', async (_event, ...args) => {
    try {
      const [filePath, mode] = args as [string, number?]
      const resolved = sandbox.validate(filePath)
      await fs.access(resolved, mode)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:readdir', async (_event, ...args) => {
    try {
      const [dirPath, options] = args as [string, { withFileTypes?: boolean }?]
      const resolved = sandbox.validate(dirPath)
      if (options?.withFileTypes) {
        const entries = await fs.readdir(resolved, { withFileTypes: true })
        return entries.map(serializeDirent)
      }
      return await fs.readdir(resolved)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:mkdir', async (_event, ...args) => {
    try {
      const [dirPath, options] = args as [string, { recursive?: boolean }?]
      const resolved = sandbox.validate(dirPath)
      return await fs.mkdir(resolved, options)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:rm', async (_event, ...args) => {
    try {
      const [filePath, options] = args as [string, { recursive?: boolean; force?: boolean }?]
      const resolved = sandbox.validate(filePath)
      await fs.rm(resolved, options)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:rename', async (_event, ...args) => {
    try {
      const [oldPath, newPath] = args as [string, string]
      const resolvedOld = sandbox.validate(oldPath)
      const resolvedNew = sandbox.validate(newPath)
      await fs.rename(resolvedOld, resolvedNew)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:copyFile', async (_event, ...args) => {
    try {
      const [src, dest] = args as [string, string]
      const resolvedSrc = sandbox.validate(src)
      const resolvedDest = sandbox.validate(dest)
      await fs.copyFile(resolvedSrc, resolvedDest)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:unlink', async (_event, ...args) => {
    try {
      const [filePath] = args as [string]
      const resolved = sandbox.validate(filePath)
      await fs.unlink(resolved)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:appendFile', async (_event, ...args) => {
    try {
      const [filePath, data, options] = args as [string, string, { encoding?: string }?]
      const resolved = sandbox.validate(filePath)
      await fs.appendFile(resolved, data, options as Parameters<typeof fs.appendFile>[2])
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:chmod', async (_event, ...args) => {
    try {
      const [filePath, mode] = args as [string, number]
      const resolved = sandbox.validate(filePath)
      await fs.chmod(resolved, mode)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:chown', async (_event, ...args) => {
    try {
      const [filePath, uid, gid] = args as [string, number, number]
      const resolved = sandbox.validate(filePath)
      await fs.chown(resolved, uid, gid)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:symlink', async (_event, ...args) => {
    try {
      const [target, linkPath, type] = args as [string, string, string?]
      const resolvedTarget = sandbox.validate(target)
      const resolvedLink = sandbox.validate(linkPath)
      await fs.symlink(resolvedTarget, resolvedLink, type as 'file' | 'dir' | 'junction')
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:readlink', async (_event, ...args) => {
    try {
      const [filePath] = args as [string]
      const resolved = sandbox.validate(filePath)
      return await fs.readlink(resolved, 'utf-8')
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:realpath', async (_event, ...args) => {
    try {
      const [filePath] = args as [string]
      const resolved = sandbox.validate(filePath)
      return await fs.realpath(resolved)
    } catch (err) { wrapFsError(err) }
  })

  ipcMain.handle('bridge:fs:truncate', async (_event, ...args) => {
    try {
      const [filePath, len] = args as [string, number?]
      const resolved = sandbox.validate(filePath)
      await fs.truncate(resolved, len)
    } catch (err) { wrapFsError(err) }
  })
}
