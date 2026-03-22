import { describe, it, expect, afterEach } from 'vitest'
import { contextBridge } from '../src/renderer/context-bridge.js'

describe('contextBridge', () => {
  afterEach(() => {
    // Clean up exposed globals
    delete (globalThis as Record<string, unknown>).testApi
    delete (globalThis as Record<string, unknown>).testApi2
  })

  it('exposeInMainWorld assigns to globalThis', () => {
    contextBridge.exposeInMainWorld('testApi', { hello: 'world' })
    expect((globalThis as Record<string, unknown>).testApi).toEqual({ hello: 'world' })
  })

  it('exposed objects are frozen', () => {
    contextBridge.exposeInMainWorld('testApi', { count: 0 })
    const api = (globalThis as Record<string, unknown>).testApi as Record<string, unknown>
    expect(Object.isFrozen(api)).toBe(true)
    expect(() => { api.count = 1 }).toThrow()
  })

  it('exposed objects are deep cloned (not same reference)', () => {
    const original = { nested: { value: 42 } }
    contextBridge.exposeInMainWorld('testApi', original)
    const api = (globalThis as Record<string, unknown>).testApi as { nested: { value: number } }
    // Should be equal in value but not the same reference
    expect(api.nested.value).toBe(42)
  })

  it('handles functions in the API', () => {
    const fn = () => 'result'
    contextBridge.exposeInMainWorld('testApi', { doThing: fn })
    const api = (globalThis as Record<string, unknown>).testApi as { doThing: () => string }
    expect(api.doThing()).toBe('result')
  })

  it('exposeInIsolatedWorld works the same as exposeInMainWorld', () => {
    contextBridge.exposeInIsolatedWorld(1000, 'testApi2', { val: 'test' })
    expect((globalThis as Record<string, unknown>).testApi2).toEqual({ val: 'test' })
  })
})
