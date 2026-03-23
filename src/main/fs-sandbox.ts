// [LAW:single-enforcer] All filesystem path validation happens here.
// No other module checks paths — this is the one boundary.

import { resolve, sep } from 'node:path'

export class PathSandbox {
  private _roots: string[] = []

  addRoot(root: string): void {
    const resolved = resolve(root)
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
    const resolved = resolve(inputPath)

    for (const root of this._roots) {
      if (resolved === root || resolved.startsWith(root + sep)) {
        return resolved
      }
    }

    throw new Error(`Path outside allowed roots: ${inputPath}`)
  }
}
