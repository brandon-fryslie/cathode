import { describe, it, expect, beforeEach } from 'vitest'
import { PathSandbox } from '../src/main/fs-sandbox.js'
import { resolve, sep } from 'node:path'
import { realpathSync } from 'node:fs'

// On macOS, /tmp is a symlink to /private/tmp. Tests must account for this.
// Walk up to find nearest existing ancestor, resolve its realpath, reattach rest.
function realOrResolve(p: string): string {
  const { dirname, basename } = require('node:path') as typeof import('node:path')
  const absolute = resolve(p)
  try { return realpathSync(absolute) } catch {}
  let current = absolute
  const segments: string[] = []
  while (current !== dirname(current)) {
    segments.unshift(basename(current))
    current = dirname(current)
    try {
      return resolve(realpathSync(current), ...segments)
    } catch {}
  }
  return absolute
}

describe('PathSandbox', () => {
  let sandbox: PathSandbox

  beforeEach(() => {
    sandbox = new PathSandbox()
    sandbox.addRoot('/Users/test/project')
    sandbox.addRoot('/tmp/workdir')
  })

  it('allows paths within a root', () => {
    const result = sandbox.validate('/Users/test/project/src/index.ts')
    expect(result).toBe(realOrResolve('/Users/test/project/src/index.ts'))
  })

  it('allows the root itself', () => {
    const result = sandbox.validate('/Users/test/project')
    expect(result).toBe(realOrResolve('/Users/test/project'))
  })

  it('allows paths in any registered root', () => {
    const result = sandbox.validate('/tmp/workdir/file.txt')
    expect(result).toBe(realOrResolve('/tmp/workdir/file.txt'))
  })

  it('rejects paths outside all roots', () => {
    expect(() => sandbox.validate('/etc/passwd')).toThrow('Path outside allowed roots')
  })

  it('rejects traversal via ..', () => {
    expect(() => sandbox.validate('/Users/test/project/../../../etc/passwd')).toThrow('Path outside allowed roots')
  })

  it('rejects paths that are prefixes but not subdirectories', () => {
    // /Users/test/project-other is NOT inside /Users/test/project
    expect(() => sandbox.validate('/Users/test/project-other/file.txt')).toThrow('Path outside allowed roots')
  })

  it('resolves relative paths against cwd', () => {
    const cwd = process.cwd()
    const cwdSandbox = new PathSandbox()
    cwdSandbox.addRoot(cwd)
    const result = cwdSandbox.validate('src/index.ts')
    expect(result).toBe(resolve(cwd, 'src/index.ts'))
  })

  it('does not add duplicate roots', () => {
    sandbox.addRoot('/Users/test/project')
    expect(sandbox.roots.filter(r => r === resolve('/Users/test/project'))).toHaveLength(1)
  })

  it('throws descriptive error with the input path', () => {
    expect(() => sandbox.validate('/forbidden/path')).toThrow('/forbidden/path')
  })
})
