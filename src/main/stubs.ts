// [LAW:one-type-per-behavior] All Tier 4 APIs share the same "stub" behavior:
// log warning, return no-op value. One factory creates them all.

// Cache of sub-class stubs so the same property always returns the same constructor
const _subClassCache = new Map<string, unknown>()

function createStubClass(name: string): new (...args: unknown[]) => Record<string, unknown> {
  return new Proxy(class {} as new (...args: unknown[]) => Record<string, unknown>, {
    construct(_target, _args) {
      console.warn(`[electron-bridge] new ${name}() is not available in web mode`)
      return createStubInstance(name)
    },
    get(_target, prop) {
      if (prop === 'prototype' || prop === 'name' || prop === Symbol.hasInstance) {
        return Reflect.get(_target, prop)
      }
      if (typeof prop === 'symbol') return Reflect.get(_target, prop)
      // Static properties that look like constructors (PascalCase) return stub classes
      // This handles patterns like: const { TouchBarButton } = TouchBar
      const key = `${name}.${String(prop)}`
      const cached = _subClassCache.get(key)
      if (cached) return cached
      const sub = createStubClass(`${name}.${String(prop)}`)
      _subClassCache.set(key, sub)
      return sub
    },
  })
}

function createStubInstance(name: string): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined
      return (..._args: unknown[]) => {
        console.warn(`[electron-bridge] ${name}.${String(prop)}() is not available in web mode`)
        return undefined
      }
    },
  })
}

function createStubModule(name: string): Record<string, (...args: unknown[]) => unknown> {
  return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined
      return (..._args: unknown[]) => {
        console.warn(`[electron-bridge] ${name}.${String(prop)}() is not available in web mode`)
        return undefined
      }
    },
  })
}

// Tier 4 stubs — classes
export const Tray = createStubClass('Tray')
export const TouchBar = createStubClass('TouchBar')

// Tier 4 stubs — modules
export const autoUpdater = createStubModule('autoUpdater')
export const safeStorage = createStubModule('safeStorage')
export const crashReporter = createStubModule('crashReporter')
export const globalShortcut = createStubModule('globalShortcut')
export const powerMonitor = createStubModule('powerMonitor')
export const powerSaveBlocker = createStubModule('powerSaveBlocker')
export const contentTracing = createStubModule('contentTracing')
export const systemPreferences = createStubModule('systemPreferences')
export const inAppPurchase = createStubModule('inAppPurchase')
export const desktopCapturer = createStubModule('desktopCapturer')
