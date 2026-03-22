/**
 * Electron-compatible event object with preventDefault support.
 * Used by both server and client code.
 */
export class ElectronEvent {
  private _defaultPrevented = false
  returnValue: unknown = undefined

  get defaultPrevented(): boolean {
    return this._defaultPrevented
  }

  preventDefault(): void {
    this._defaultPrevented = true
  }
}

/**
 * Minimal EventEmitter that works in both Node.js and browser.
 *
 * In Node.js, we use the native EventEmitter. In the browser, we provide
 * this lightweight implementation with the same API surface that Electron
 * renderer code relies on.
 */
export class BrowserEventEmitter {
  private _listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  on(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this._listeners.get(event) ?? []
    listeners.push(listener)
    this._listeners.set(event, listeners)
    return this
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapped = (...args: unknown[]): void => {
      this.off(event, wrapped)
      listener(...args)
    }
    return this.on(event, wrapped)
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this._listeners.get(event)
    if (listeners) {
      const idx = listeners.indexOf(listener)
      if (idx !== -1) listeners.splice(idx, 1)
      if (listeners.length === 0) this._listeners.delete(event)
    }
    return this
  }

  addListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener)
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.off(event, listener)
  }

  removeAllListeners(event?: string): this {
    if (event !== undefined) {
      this._listeners.delete(event)
    } else {
      this._listeners.clear()
    }
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this._listeners.get(event)
    if (!listeners || listeners.length === 0) return false
    // Snapshot to allow mutation during iteration
    for (const listener of [...listeners]) {
      listener(...args)
    }
    return true
  }

  listenerCount(event: string): number {
    return this._listeners.get(event)?.length ?? 0
  }
}
