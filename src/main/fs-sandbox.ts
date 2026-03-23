// [LAW:single-enforcer] All filesystem path validation happens here.
// No other module checks paths — this is the one boundary.

import { resolve, sep, dirname, basename } from 'node:path'
import { realpathSync } from 'node:fs'

function safeRealpath(p: string): string {
  const absolute = resolve(p)
  try {
    return realpathSync(absolute)
  } catch {
    // Path doesn't exist yet. Walk up to find the nearest existing ancestor,
    // resolve its realpath, then reattach the remaining segments.
    let current = absolute
    const segments: string[] = []
    while (current !== dirname(current)) {
      segments.unshift(basename(current))
      current = dirname(current)
      try {
        const realParent = realpathSync(current)
        return resolve(realParent, ...segments)
      } catch {
        // Keep walking up
      }
    }
    return absolute
  }
}

export class PathSandbox {
  private _roots: string[] = []

  addRoot(root: string): void {
    // Resolve symlinks so /var/... and /private/var/... match on macOS
    const resolved = safeRealpath(root)
    if (!this._roots.includes(resolved)) {
      this._roots.push(resolved)
    }
  }

  get roots(): readonly string[] {
    return this._roots
  }

  /**
   * Validate that a path is within allowed roots.
   * Returns the resolved absolute path if valid.
   * Throws if the path is outside all allowed roots.
   */
  validate(inputPath: string): string {
    const resolved = safeRealpath(inputPath)

    for (const root of this._roots) {
      if (resolved === root || resolved.startsWith(root + sep)) {
        return resolved
      }
    }

    throw new Error(`Path outside allowed roots: ${inputPath}`)
  }

  /**
   * Like validate, but doesn't follow the final symlink.
   * Used for readlink, lstat, and the link path in symlink operations.
   */
  validateNoFollow(inputPath: string): string {
    const absolute = resolve(inputPath)
    // Resolve the parent directory's realpath, keep the filename as-is
    const parent = dirname(absolute)
    const name = basename(absolute)
    const resolvedParent = safeRealpath(parent)
    const resolved = resolve(resolvedParent, name)

    for (const root of this._roots) {
      if (resolved === root || resolved.startsWith(root + sep)) {
        return resolved
      }
    }

    throw new Error(`Path outside allowed roots: ${inputPath}`)
  }
}
