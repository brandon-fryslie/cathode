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

  it('returns 404 for unknown routes', async () => {
    server = new BridgeServer(0)
    await server.listen()

    const addr = server.httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0
    const res = await fetch(`http://localhost:${port}/nonexistent-path`)
    expect(res.status).toBe(404)
  })
})
