import { EventEmitter } from 'node:events'

class Session extends EventEmitter {
  /** Clear browser storage (sends command to client) */
  clearStorageData(): Promise<void> {
    // In web mode, this would need to tell the client to clear localStorage
    return Promise.resolve()
  }

  clearCache(): Promise<void> {
    return Promise.resolve()
  }

  getUserAgent(): string {
    return `electron-bridge/${process.env.npm_package_version ?? '0.1.0'}`
  }

  setUserAgent(_userAgent: string): void {
    // Can't change browser's user agent
  }

  /** Cookies API — minimal stub */
  cookies = {
    get: async (_filter: unknown) => [] as unknown[],
    set: async (_details: unknown) => {},
    remove: async (_url: string, _name: string) => {},
    flushStore: async () => {},
  }
}

export const session = {
  defaultSession: new Session(),
  fromPartition(_partition: string): Session {
    // In web mode, all sessions share the same browser context
    return this.defaultSession
  },
}
