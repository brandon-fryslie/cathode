/**
 * electron-bridge CLI launcher.
 *
 * Hooks Node's module resolution so require('electron') returns electron-bridge,
 * then loads the target app's main script. Native modules that fail to load
 * are replaced with warning stubs.
 *
 * Usage: electron-bridge <app-path>
 *   <app-path> can be a directory (reads package.json main) or a JS file.
 */

import Module from 'node:module'
import { resolve, join } from 'node:path'
import { readFileSync, statSync } from 'node:fs'

// Known native/platform-specific modules that won't work in bridge mode
const NATIVE_MODULE_STUBS = new Set([
  'robotjs',
  'osx-mouse',
  'win-mouse',
  'iohook',
])

// --- Hook require('electron') and stub native modules ---
const originalResolveFilename = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename
;(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename = function (
  request: string,
  ...rest: unknown[]
) {
  if (request === 'electron') {
    return originalResolveFilename.call(this, resolve(__dirname, 'index.cjs'), ...rest)
  }
  // For known native modules, intercept resolution failures
  if (NATIVE_MODULE_STUBS.has(request)) {
    try {
      return originalResolveFilename.call(this, request, ...rest)
    } catch {
      // Module not installed or can't be found — return a sentinel path
      return `__bridge_stub__:${request}`
    }
  }
  return originalResolveFilename.call(this, request, ...rest)
}

// Hook Module._load to return stubs for sentinel paths and failed native loads
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load
;(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (
  request: string,
  ...rest: unknown[]
) {
  // Handle our sentinel paths
  if (typeof request === 'string' && request.startsWith('__bridge_stub__:')) {
    const modName = request.slice('__bridge_stub__:'.length)
    console.warn(`[electron-bridge] Native module '${modName}' is not available in web mode — using stub`)
    return createNativeStub(modName)
  }
  try {
    return originalLoad.call(this, request, ...rest)
  } catch (err: unknown) {
    // If a .node binary fails to load, stub it
    if (err && typeof err === 'object' && 'code' in err && err.code === 'MODULE_NOT_FOUND' &&
        typeof request === 'string' && (request.endsWith('.node') || NATIVE_MODULE_STUBS.has(request))) {
      const modName = request.replace(/^.*[/\\]/, '').replace(/\.node$/, '')
      console.warn(`[electron-bridge] Native module '${modName}' failed to load — using stub`)
      return createNativeStub(modName)
    }
    throw err
  }
}

function createNativeStub(name: string): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === '__esModule') return false
      if (prop === 'default') return _target
      return (..._args: unknown[]) => {
        console.warn(`[electron-bridge] ${name}.${String(prop)}() is not available in web mode`)
        return undefined
      }
    },
  })
}

// --- Resolve the app entry point ---
const appArg = process.argv[2]
if (!appArg) {
  console.error('Usage: electron-bridge <app-path>')
  console.error('  <app-path> can be a directory (reads package.json) or a JS file')
  process.exit(1)
}

const appPath = resolve(process.cwd(), appArg)

let entryPoint: string

try {
  const stat = statSync(appPath)
  if (stat.isDirectory()) {
    const pkgPath = join(appPath, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const main = pkg.main ?? 'index.js'
    entryPoint = resolve(appPath, main)
    process.chdir(appPath)
  } else {
    entryPoint = appPath
    process.chdir(resolve(appPath, '..'))
  }
} catch (err) {
  console.error(`[electron-bridge] Could not resolve app entry: ${appPath}`)
  console.error(err)
  process.exit(1)
}

// --- Load the app ---
console.log(`[electron-bridge] Loading app: ${entryPoint}`)
require(entryPoint)
