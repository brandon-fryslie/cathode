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

// --- Sync API (matches Node's fs module) ---

export function readFileSync(filePath: string, encoding?: BufferEncoding | { encoding: BufferEncoding }): string | number[] {
  const enc = typeof encoding === 'object' ? encoding.encoding : encoding
  return callSync('readFileSync', [filePath, enc]) as string | number[]
}

export function writeFileSync(filePath: string, data: string, options?: { encoding?: string; flag?: string; mode?: number } | string): void {
  const opts = typeof options === 'string' ? { encoding: options } : options
  callSync('writeFileSync', [filePath, data, opts])
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
  callSync('rmdirSync', [dirPath, options])
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
}

// --- Callback API (wraps sync for compatibility) ---

export function readFile(filePath: string, encodingOrCb: BufferEncoding | ((err: Error | null, data?: unknown) => void), callback?: (err: Error | null, data?: unknown) => void): void {
  const cb = typeof encodingOrCb === 'function' ? encodingOrCb : callback!
  const encoding = typeof encodingOrCb === 'string' ? encodingOrCb : undefined
  try {
    const result = readFileSync(filePath, encoding)
    cb(null, result as string)
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
  try {
    renameSync(oldPath, newPath)
    callback(null)
  } catch (err) {
    callback(err as Error)
  }
}

export function copyFile(src: string, dest: string, callback: (err: Error | null) => void): void {
  try {
    copyFileSync(src, dest)
    callback(null)
  } catch (err) {
    callback(err as Error)
  }
}

export function unlink(filePath: string, callback: (err: Error | null) => void): void {
  try {
    unlinkSync(filePath)
    callback(null)
  } catch (err) {
    callback(err as Error)
  }
}

export function rm(filePath: string, options: { recursive?: boolean; force?: boolean }, callback: (err: Error | null) => void): void {
  try {
    rmdirSync(filePath, options)
    callback(null)
  } catch (err) {
    callback(err as Error)
  }
}

// --- Default export matches Node's fs module shape ---

const fsModule = {
  readFileSync, writeFileSync, existsSync, statSync, lstatSync,
  accessSync, readdirSync, mkdirSync, rmdirSync, rmSync,
  renameSync, copyFileSync, unlinkSync,
  readFile, writeFile, mkdir, rename, copyFile, unlink, rm,
  promises,
}

export default fsModule
