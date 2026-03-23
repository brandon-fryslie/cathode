import type { SerializedStats, SerializedDirent } from '../shared/types.js'
import { ipcRenderer } from './ipc-renderer.js'

export class FsError extends Error {
  readonly code: string
  readonly path?: string

  constructor(message: string, code: string, fsPath?: string) {
    super(message)
    this.name = 'FsError'
    this.code = code
    this.path = fsPath
  }
}

function parseFsError(err: unknown): FsError {
  const raw = err instanceof Error ? err.message : String(err)
  try {
    const data = JSON.parse(raw)
    return new FsError(data.message ?? raw, data.code ?? 'UNKNOWN', data.path)
  } catch {
    return new FsError(raw, 'UNKNOWN')
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args) as T
  } catch (err) {
    throw parseFsError(err)
  }
}

export const bridgeFs = {
  readFile(filePath: string, encoding?: string): Promise<string | number[]> {
    return invoke('bridge:fs:readFile', filePath, encoding)
  },

  writeFile(filePath: string, data: string, options?: { encoding?: string; flag?: string }): Promise<void> {
    return invoke('bridge:fs:writeFile', filePath, data, options)
  },

  stat(filePath: string): Promise<SerializedStats> {
    return invoke('bridge:fs:stat', filePath)
  },

  lstat(filePath: string): Promise<SerializedStats> {
    return invoke('bridge:fs:lstat', filePath)
  },

  access(filePath: string, mode?: number): Promise<void> {
    return invoke('bridge:fs:access', filePath, mode)
  },

  readdir(filePath: string, options?: { withFileTypes?: boolean }): Promise<string[] | SerializedDirent[]> {
    return invoke('bridge:fs:readdir', filePath, options)
  },

  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<string | undefined> {
    return invoke('bridge:fs:mkdir', dirPath, options)
  },

  rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    return invoke('bridge:fs:rm', filePath, options)
  },

  rename(oldPath: string, newPath: string): Promise<void> {
    return invoke('bridge:fs:rename', oldPath, newPath)
  },

  copyFile(src: string, dest: string): Promise<void> {
    return invoke('bridge:fs:copyFile', src, dest)
  },

  unlink(filePath: string): Promise<void> {
    return invoke('bridge:fs:unlink', filePath)
  },

  appendFile(filePath: string, data: string, options?: { encoding?: string }): Promise<void> {
    return invoke('bridge:fs:appendFile', filePath, data, options)
  },

  chmod(filePath: string, mode: number): Promise<void> {
    return invoke('bridge:fs:chmod', filePath, mode)
  },

  chown(filePath: string, uid: number, gid: number): Promise<void> {
    return invoke('bridge:fs:chown', filePath, uid, gid)
  },

  symlink(target: string, linkPath: string, type?: string): Promise<void> {
    return invoke('bridge:fs:symlink', target, linkPath, type)
  },

  readlink(filePath: string): Promise<string> {
    return invoke('bridge:fs:readlink', filePath)
  },

  realpath(filePath: string): Promise<string> {
    return invoke('bridge:fs:realpath', filePath)
  },

  truncate(filePath: string, len?: number): Promise<void> {
    return invoke('bridge:fs:truncate', filePath, len)
  },
}
