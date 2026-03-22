import { describe, it, expect, afterAll } from 'vitest'
import { app } from '../src/main/app.js'

describe('app', () => {
  afterAll(async () => {
    // Clean up the server
    await app._bridgeServer.close()
  })

  it('fires ready and resolves whenReady', async () => {
    await app.whenReady()
    expect(app.isReady()).toBe(true)
  })

  it('getName returns a string', () => {
    app.setName('test-app')
    expect(app.getName()).toBe('test-app')
  })

  it('getPath returns real paths', () => {
    const home = app.getPath('home')
    expect(typeof home).toBe('string')
    expect(home.length).toBeGreaterThan(0)

    const temp = app.getPath('temp')
    expect(typeof temp).toBe('string')
  })

  it('getPath throws for unknown path names', () => {
    expect(() => app.getPath('nonexistent')).toThrow("Failed to get path 'nonexistent'")
  })

  it('getLocale returns a locale string', () => {
    const locale = app.getLocale()
    expect(typeof locale).toBe('string')
    expect(locale.length).toBeGreaterThan(0)
  })

  it('getAppPath returns cwd', () => {
    expect(app.getAppPath()).toBe(process.cwd())
  })
})
