/**
 * Node.js-compatible fs module for the browser renderer.
 * Sync methods use synchronous XMLHttpRequest to the bridge server.
 * Async methods (promises) delegate to bridgeFs via WebSocket.
 */

import type { SerializedStats, SerializedDirent } from '../shared/types.js'
import { bridgeFs, FsError } from './bridge-fs.js'

function callSync(method: string, args: unknown[]): unknown {
  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/__bridge/fs', false) // false = synchronous
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.send(JSON.stringify({ method, args }))

  const response = JSON.parse(xhr.responseText)
  if (xhr.status !== 200 || response.error) {
    const err = response.error ?? { code: 'UNKNOWN', message: 'Unknown fs error' }
    throw new FsError(err.message, err.code, err.path)
  }
  return response.result
}

// --- Constants ---

export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  COPYFILE_EXCL: 1,
  COPYFILE_FICLONE: 2,
  COPYFILE_FICLONE_FORCE: 4,
}

// --- Sync API (matches Node's fs module) ---

export function readFileSync(filePath: string, encoding?: BufferEncoding | { encoding: BufferEncoding }): string | number[] {
  const enc = typeof encoding === 'object' ? encoding.encoding : encoding
  return callSync('readFileSync', [filePath, enc]) as string | number[]
}

export function writeFileSync(filePath: string, data: string, options?: { encoding?: string; flag?: string; mode?: number } | string): void {
  const opts = typeof options === 'string' ? { encoding: options } : options
  callSync('writeFileSync', [filePath, data, opts])
}

export function appendFileSync(filePath: string, data: string, options?: { encoding?: string; flag?: string } | string): void {
  const opts = typeof options === 'string' ? { encoding: options } : options
  callSync('appendFileSync', [filePath, data, opts])
}

export function existsSync(filePath: string): boolean {
  return callSync('existsSync', [filePath]) as boolean
}

export function statSync(filePath: string): SerializedStats {
  return callSync('statSync', [filePath]) as SerializedStats
}

export function lstatSync(filePath: string): SerializedStats {
  return callSync('lstatSync', [filePath]) as SerializedStats
}

export function accessSync(filePath: string, mode?: number): void {
  callSync('accessSync', [filePath, mode])
}

export function readdirSync(dirPath: string, options?: { withFileTypes?: boolean } | { encoding?: string }): string[] | SerializedDirent[] {
  return callSync('readdirSync', [dirPath, options]) as string[] | SerializedDirent[]
}

export function mkdirSync(dirPath: string, options?: { recursive?: boolean }): string | undefined {
  return callSync('mkdirSync', [dirPath, options]) as string | undefined
}

export function rmdirSync(dirPath: string, options?: { recursive?: boolean }): void {
  callSync('rmdirSync', [dirPath, options])
}

export function rmSync(dirPath: string, options?: { recursive?: boolean; force?: boolean }): void {
  callSync('rmSync', [dirPath, options])
}

export function renameSync(oldPath: string, newPath: string): void {
  callSync('renameSync', [oldPath, newPath])
}

export function copyFileSync(src: string, dest: string): void {
  callSync('copyFileSync', [src, dest])
}

export function unlinkSync(filePath: string): void {
  callSync('unlinkSync', [filePath])
}

export function chmodSync(filePath: string, mode: number): void {
  callSync('chmodSync', [filePath, mode])
}

export function chownSync(filePath: string, uid: number, gid: number): void {
  callSync('chownSync', [filePath, uid, gid])
}

export function symlinkSync(target: string, linkPath: string, type?: string): void {
  callSync('symlinkSync', [target, linkPath, type])
}

export function readlinkSync(filePath: string): string {
  return callSync('readlinkSync', [filePath]) as string
}

export function realpathSync(filePath: string): string {
  return callSync('realpathSync', [filePath]) as string
}

export function truncateSync(filePath: string, len?: number): void {
  callSync('truncateSync', [filePath, len])
}

export function openSync(filePath: string, flags: string, mode?: number): number {
  return callSync('openSync', [filePath, flags, mode]) as number
}

export function readSync(fd: number, buffer: unknown, offset: number, length: number, position: number | null): number {
  const result = callSync('readSync', [fd, length, position]) as { bytesRead: number; data: number[] }
  // Copy data into the provided buffer if it's a typed array
  if (buffer && typeof buffer === 'object' && 'set' in (buffer as Uint8Array)) {
    (buffer as Uint8Array).set(result.data, offset)
  }
  return result.bytesRead
}

export function writeSync(fd: number, data: string, position?: number, encoding?: string): number {
  return callSync('writeSync', [fd, data, position, encoding]) as number
}

export function closeSync(fd: number): void {
  callSync('closeSync', [fd])
}

// --- Async API (fs/promises compatible) ---

export const promises = {
  readFile: bridgeFs.readFile,
  writeFile: bridgeFs.writeFile,
  stat: bridgeFs.stat,
  lstat: bridgeFs.lstat,
  access: bridgeFs.access,
  readdir: bridgeFs.readdir,
  mkdir: bridgeFs.mkdir,
  rm: bridgeFs.rm,
  rename: bridgeFs.rename,
  copyFile: bridgeFs.copyFile,
  unlink: bridgeFs.unlink,
  appendFile: bridgeFs.appendFile,
  chmod: bridgeFs.chmod,
  chown: bridgeFs.chown,
  symlink: bridgeFs.symlink,
  readlink: bridgeFs.readlink,
  realpath: bridgeFs.realpath,
  truncate: bridgeFs.truncate,
}

// --- Callback API (wraps sync for compatibility) ---

export function readFile(filePath: string, encodingOrCb: BufferEncoding | ((err: Error | null, data?: unknown) => void), callback?: (err: Error | null, data?: unknown) => void): void {
  const cb = typeof encodingOrCb === 'function' ? encodingOrCb : callback!
  const encoding = typeof encodingOrCb === 'string' ? encodingOrCb : undefined
  try {
    const result = readFileSync(filePath, encoding)
    cb(null, result)
  } catch (err) {
    cb(err as Error)
  }
}

export function writeFile(filePath: string, data: string, options: unknown, callback?: (err: Error | null) => void): void {
  const cb = typeof options === 'function' ? options as (err: Error | null) => void : callback!
  const opts = typeof options === 'function' ? undefined : options
  try {
    writeFileSync(filePath, data, opts as { encoding?: string; flag?: string })
    cb(null)
  } catch (err) {
    cb(err as Error)
  }
}

export function appendFile(filePath: string, data: string, options: unknown, callback?: (err: Error | null) => void): void {
  const cb = typeof options === 'function' ? options as (err: Error | null) => void : callback!
  const opts = typeof options === 'function' ? undefined : options
  try {
    appendFileSync(filePath, data, opts as { encoding?: string })
    cb(null)
  } catch (err) {
    cb(err as Error)
  }
}

export function mkdir(dirPath: string, optionsOrCb: unknown, callback?: (err: Error | null) => void): void {
  const cb = typeof optionsOrCb === 'function' ? optionsOrCb as (err: Error | null) => void : callback!
  const opts = typeof optionsOrCb === 'function' ? undefined : optionsOrCb
  try {
    mkdirSync(dirPath, opts as { recursive?: boolean })
    cb(null)
  } catch (err) {
    cb(err as Error)
  }
}

export function rename(oldPath: string, newPath: string, callback: (err: Error | null) => void): void {
  try { renameSync(oldPath, newPath); callback(null) } catch (err) { callback(err as Error) }
}

export function copyFile(src: string, dest: string, callback: (err: Error | null) => void): void {
  try { copyFileSync(src, dest); callback(null) } catch (err) { callback(err as Error) }
}

export function unlink(filePath: string, callback: (err: Error | null) => void): void {
  try { unlinkSync(filePath); callback(null) } catch (err) { callback(err as Error) }
}

export function rm(filePath: string, options: { recursive?: boolean; force?: boolean }, callback: (err: Error | null) => void): void {
  try { rmSync(filePath, options); callback(null) } catch (err) { callback(err as Error) }
}

export function chmod(filePath: string, mode: number, callback: (err: Error | null) => void): void {
  try { chmodSync(filePath, mode); callback(null) } catch (err) { callback(err as Error) }
}

export function chown(filePath: string, uid: number, gid: number, callback: (err: Error | null) => void): void {
  try { chownSync(filePath, uid, gid); callback(null) } catch (err) { callback(err as Error) }
}

export function symlink(target: string, linkPath: string, typeOrCb: string | ((err: Error | null) => void), callback?: (err: Error | null) => void): void {
  const cb = typeof typeOrCb === 'function' ? typeOrCb : callback!
  const type = typeof typeOrCb === 'string' ? typeOrCb : undefined
  try { symlinkSync(target, linkPath, type); cb(null) } catch (err) { cb(err as Error) }
}

export function readlink(filePath: string, callback: (err: Error | null, linkString?: string) => void): void {
  try { callback(null, readlinkSync(filePath)) } catch (err) { callback(err as Error) }
}

export function realpath(filePath: string, callback: (err: Error | null, resolvedPath?: string) => void): void {
  try { callback(null, realpathSync(filePath)) } catch (err) { callback(err as Error) }
}

export function truncate(filePath: string, lenOrCb: number | ((err: Error | null) => void), callback?: (err: Error | null) => void): void {
  const cb = typeof lenOrCb === 'function' ? lenOrCb : callback!
  const len = typeof lenOrCb === 'number' ? lenOrCb : undefined
  try { truncateSync(filePath, len); cb(null) } catch (err) { cb(err as Error) }
}

export function stat(filePath: string, callback: (err: Error | null, stats?: SerializedStats) => void): void {
  try { callback(null, statSync(filePath)) } catch (err) { callback(err as Error) }
}

export function lstat(filePath: string, callback: (err: Error | null, stats?: SerializedStats) => void): void {
  try { callback(null, lstatSync(filePath)) } catch (err) { callback(err as Error) }
}

export function access(filePath: string, modeOrCb: number | ((err: Error | null) => void), callback?: (err: Error | null) => void): void {
  const cb = typeof modeOrCb === 'function' ? modeOrCb : callback!
  const mode = typeof modeOrCb === 'number' ? modeOrCb : undefined
  try { accessSync(filePath, mode); cb(null) } catch (err) { cb(err as Error) }
}

// createReadStream/createWriteStream — not supported over sync XHR.
// These would need a streaming protocol. Documented as unsupported.
export function createReadStream(): never {
  throw new Error('[electron-bridge] createReadStream is not supported in browser mode. Use bridgeFs.readFile() instead.')
}

export function createWriteStream(): never {
  throw new Error('[electron-bridge] createWriteStream is not supported in browser mode. Use bridgeFs.writeFile() instead.')
}

// watch/watchFile — subscription-based, separate feature (fs.watch epic task)
export function watch(): never {
  throw new Error('[electron-bridge] fs.watch is not yet supported. See electron-filesystem-4e1.4 in the roadmap.')
}

export function watchFile(): never {
  throw new Error('[electron-bridge] fs.watchFile is not yet supported. See electron-filesystem-4e1.4 in the roadmap.')
}

export function unwatchFile(): void {
  // no-op
}

// --- Default export matches Node's fs module shape ---

const fsModule = {
  constants,
  // Sync
  readFileSync, writeFileSync, appendFileSync, existsSync,
  statSync, lstatSync, accessSync, readdirSync,
  mkdirSync, rmdirSync, rmSync, renameSync, copyFileSync, unlinkSync,
  chmodSync, chownSync, symlinkSync, readlinkSync, realpathSync, truncateSync,
  openSync, readSync, writeSync, closeSync,
  // Callback
  readFile, writeFile, appendFile, mkdir, rename, copyFile, unlink, rm,
  chmod, chown, symlink, readlink, realpath, truncate, stat, lstat, access,
  createReadStream, createWriteStream, watch, watchFile, unwatchFile,
  // Promises
  promises,
}

export default fsModule
