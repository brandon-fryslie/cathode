import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { BridgeServer } from '../src/main/server.js'

describe('BridgeServer', () => {
  let server: BridgeServer

  afterEach(async () => {
    if (server) await server.close()
  })

  it('starts and listens on the specified port', async () => {
    server = new BridgeServer(0) // random port
    await server.listen()
    const addr = server.httpServer.address()
    expect(addr).not.toBeNull()
    expect(typeof addr === 'object' && addr !== null && addr.port).toBeGreaterThan(0)
  })

  it('serves the window shell HTML at /', async () => {
    server = new BridgeServer(0)
    server.setRoute({ windowId: 1, title: 'Test Window' })
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')

    const html = await res.text()
    expect(html).toContain('__BRIDGE_WINDOW_ID__')
    expect(html).toContain('Test Window')
  })

  it('accepts WebSocket connections', async () => {
    server = new BridgeServer(0)
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0

    const ws = new WebSocket(`ws://localhost:${port}/__bridge/ws?windowId=1`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('routes messages to the handler', async () => {
    server = new BridgeServer(0)
    await server.listen()

    const received: unknown[] = []
    server.setMessageHandler((windowId, msg) => {
      received.push({ windowId, msg })
    })

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0

    const ws = new WebSocket(`ws://localhost:${port}/__bridge/ws?windowId=5`)
    await new Promise<void>(resolve => ws.on('open', resolve))

    ws.send(JSON.stringify({ type: 'ipc:send', channel: 'test', args: [1, 2], windowId: 5 }))

    // Wait for message to arrive
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(received.length).toBe(1)
    expect((received[0] as { windowId: number }).windowId).toBe(5)
    expect((received[0] as { msg: { channel: string } }).msg.channel).toBe('test')

    ws.close()
  })

  it('sendToWindow delivers to the correct client', async () => {
    server = new BridgeServer(0)
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0

    const ws = new WebSocket(`ws://localhost:${port}/__bridge/ws?windowId=1`)
    await new Promise<void>(resolve => ws.on('open', resolve))

    const messages: unknown[] = []
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())))

    server.sendToWindow(1, { type: 'ipc:message', channel: 'greet', args: ['hi'] })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(messages.length).toBe(1)
    expect((messages[0] as { channel: string }).channel).toBe('greet')

    ws.close()
  })

  it('injects process shim before bridge scripts in minimal shell', async () => {
    server = new BridgeServer(0)
    server.setProcessInfo({
      env: { NODE_ENV: 'test', FOO: 'bar' },
      platform: 'linux',
      arch: 'x64',
      versions: { node: '20.0.0' },
    })
    server.setRoute({ windowId: 1, title: 'Process Test' })
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0
    const html = await (await fetch(`http://localhost:${port}/`)).text()

    // Process shim is present
    expect(html).toContain('globalThis.process')
    expect(html).toContain('"NODE_ENV":"test"')
    expect(html).toContain('"platform":"linux"')
    expect(html).toContain('"arch":"x64"')

    // Process shim appears before __BRIDGE_WINDOW_ID__
    const processIdx = html.indexOf('globalThis.process')
    const windowIdIdx = html.indexOf('__BRIDGE_WINDOW_ID__')
    expect(processIdx).toBeLessThan(windowIdIdx)
  })

  it('injects process shim into content HTML via _injectBridgeScripts', async () => {
    server = new BridgeServer(0)
    server.setProcessInfo({
      env: { APP_MODE: 'web' },
      platform: 'darwin',
      versions: { node: '18.0.0' },
    })

    // Create a temp HTML file to serve
    const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const tmpDir = mkdtempSync(join((await import('node:os')).tmpdir(), 'bridge-test-'))
    writeFileSync(join(tmpDir, 'index.html'), '<!DOCTYPE html><html><head><title>App</title></head><body></body></html>')

    server.addStaticDir(tmpDir)
    server.setRoute({ windowId: 1, title: 'Injected', contentPath: 'index.html' })
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0
    const html = await (await fetch(`http://localhost:${port}/`)).text()

    expect(html).toContain('globalThis.process')
    expect(html).toContain('"APP_MODE":"web"')
    expect(html).toContain('"platform":"darwin"')

    // Process shim appears before __BRIDGE_WINDOW_ID__ in injected HTML too
    const processIdx = html.indexOf('globalThis.process')
    const windowIdIdx = html.indexOf('__BRIDGE_WINDOW_ID__')
    expect(processIdx).toBeLessThan(windowIdIdx)

    rmSync(tmpDir, { recursive: true })
  })

  it('omits process shim when setProcessInfo is not called', async () => {
    server = new BridgeServer(0)
    server.setRoute({ windowId: 1, title: 'No Process' })
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0
    const html = await (await fetch(`http://localhost:${port}/`)).text()

    // Should have window ID but no process shim
    expect(html).toContain('__BRIDGE_WINDOW_ID__')
    expect(html).not.toContain('globalThis.process')
  })

  it('returns 404 for unknown routes', async () => {
    server = new BridgeServer(0)
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0
    const res = await fetch(`http://localhost:${port}/nonexistent-path`)
    expect(res.status).toBe(404)
  })
})
