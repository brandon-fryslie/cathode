/** net module — thin wrapper around Node's fetch/http */
export const net = {
  /** Same as global fetch (available in Node 18+) */
  fetch: globalThis.fetch,

  /** Whether the machine has network connectivity */
  isOnline(): boolean {
    return true // Server-side — assume online
  },

  get online(): boolean {
    return this.isOnline()
  },

  /** Electron's net.request is complex — stub it */
  request(_options: unknown): never {
    throw new Error(
      '[electron-bridge] net.request() is not supported. Use fetch() instead.'
    )
  },
}
