/**
 * contextBridge shim for browser.
 *
 * In Electron, contextBridge provides safe cross-world communication.
 * In the browser, there's no context isolation — exposeInMainWorld
 * simply assigns to window with a frozen deep clone (matching Electron's
 * immutability guarantee).
 */

function deepClone(obj: unknown): unknown {
  // Use structuredClone if available, otherwise JSON round-trip
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj)
    } catch {
      // Functions can't be structuredClone'd — walk manually
    }
  }
  return cloneWithFunctions(obj)
}

function cloneWithFunctions(obj: unknown, seen = new WeakSet()): unknown {
  if (obj === null || typeof obj !== 'object') return obj
  if (typeof obj === 'function') return obj // Functions are proxied, not cloned (matches Electron)
  if (seen.has(obj as object)) return undefined // Circular ref protection
  seen.add(obj as object)

  if (Array.isArray(obj)) {
    return obj.map(item => cloneWithFunctions(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = cloneWithFunctions(value, seen)
  }
  return result
}

function deepFreeze(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object' || typeof obj === 'function') return obj
  Object.freeze(obj)
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value)
    }
  }
  return obj
}

export const contextBridge = {
  // [LAW:dataflow-not-control-flow] Always assign — no guards on whether isolation exists.
  exposeInMainWorld(apiKey: string, api: unknown): void {
    const cloned = deepClone(api)
    const frozen = typeof cloned === 'object' && cloned !== null ? deepFreeze(cloned) : cloned
    ;(globalThis as Record<string, unknown>)[apiKey] = frozen
  },

  exposeInIsolatedWorld(_worldId: number, apiKey: string, api: unknown): void {
    // In browser there's only one world — same as exposeInMainWorld
    this.exposeInMainWorld(apiKey, api)
  },
}
