// [LAW:single-enforcer] All WebSocket message validation happens here, at the server boundary.

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '../shared/protocol.js'
import { handleFsRequest } from './fs-rest.js'
import { _getFsSandbox } from './fs-service.js'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
}

export interface WindowRoute {
  windowId: number
  contentPath?: string // file path to serve
  contentUrl?: string  // URL to redirect/proxy to
  title: string
  preloadSource?: string // source code of the preload script
}

export type ClientMessageHandler = (windowId: number, message: ClientMessage, ws: WebSocket) => void

export class BridgeServer {
  private _httpServer: http.Server
  private _wss: WebSocketServer
  private _port: number
  private _connections = new Map<number, Set<WebSocket>>() // windowId → connected clients
  private _routes = new Map<number, WindowRoute>()
  private _staticDirs: string[] = []
  private _onMessage: ClientMessageHandler = () => {}
  private _onClientReady: (windowId: number, ws: WebSocket) => void = () => {}
  private _onClientDisconnect: (windowId: number) => void = () => {}
  private _rendererBundle: string | null = null
  private _processShim: string | null = null

  constructor(port = 3000) {
    this._port = port
    this._httpServer = http.createServer((req, res) => this._handleHttp(req, res))
    this._wss = new WebSocketServer({ noServer: true })
    this._httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://localhost:${this._port}`)
      if (url.pathname === '/__bridge/ws') {
        this._wss.handleUpgrade(req, socket, head, (ws) => {
          const windowId = parseInt(url.searchParams.get('windowId') ?? '1', 10)
          this._attachClient(windowId, ws)
        })
      } else {
        socket.destroy()
      }
    })
  }

  get httpServer(): http.Server { return this._httpServer }
  get port(): number { return this._port }

  setMessageHandler(handler: ClientMessageHandler): void {
    this._onMessage = handler
  }

  setClientReadyHandler(handler: (windowId: number, ws: WebSocket) => void): void {
    this._onClientReady = handler
  }

  setClientDisconnectHandler(handler: (windowId: number) => void): void {
    this._onClientDisconnect = handler
  }

  setRendererBundle(code: string): void {
    this._rendererBundle = code
  }

  /** Configure the process shim injected into every rendered page. */
  setProcessInfo(info: { env: Record<string, string | undefined>; platform: string; versions: Record<string, string>; type?: string; arch?: string }): void {
    // [LAW:one-source-of-truth] The server's Node process is the canonical source; this serializes it once for all clients.
    const shim = {
      env: info.env,
      platform: info.platform,
      arch: info.arch ?? 'unknown',
      type: info.type ?? 'renderer',
      versions: info.versions,
      version: info.versions.node ? `v${info.versions.node}` : '',
      // Stubs for common process properties that renderer code may read
      pid: 0,
      ppid: 0,
      argv: [],
      execPath: '',
      cwd: () => '/',
      nextTick: (fn: () => void) => Promise.resolve().then(fn),
      stdout: { write: () => true },
      stderr: { write: () => true },
    }
    this._processShim = `globalThis.process=Object.assign(globalThis.process||{},${JSON.stringify(shim)});globalThis.process.cwd=function(){return "/"};globalThis.process.nextTick=function(fn){Promise.resolve().then(fn)};globalThis.process.stdout={write:function(){return true}};globalThis.process.stderr={write:function(){return true}}`
  }

  addStaticDir(dir: string): void {
    if (!this._staticDirs.includes(dir)) {
      this._staticDirs.push(dir)
    }
  }

  setRoute(route: WindowRoute): void {
    this._routes.set(route.windowId, route)
  }

  removeRoute(windowId: number): void {
    this._routes.delete(windowId)
  }

  /** Send a message to all clients connected to a specific window */
  sendToWindow(windowId: number, message: ServerMessage): void {
    const clients = this._connections.get(windowId)
    if (!clients) return
    const data = JSON.stringify(message)
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    }
  }

  /** Send a message to all connected clients */
  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message)
    for (const clients of this._connections.values()) {
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      }
    }
  }

  hasConnectedClients(windowId: number): boolean {
    const clients = this._connections.get(windowId)
    if (!clients) return false
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) return true
    }
    return false
  }

  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._httpServer.on('error', reject)
      this._httpServer.listen(this._port, () => {
        this._httpServer.removeListener('error', reject)
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    // Close all WebSocket connections
    for (const clients of this._connections.values()) {
      for (const ws of clients) {
        ws.close(1001, 'Server shutting down')
      }
    }
    this._connections.clear()

    return new Promise((resolve) => {
      this._wss.close(() => {
        this._httpServer.close(() => resolve())
      })
    })
  }

  private _attachClient(windowId: number, ws: WebSocket): void {
    const clients = this._connections.get(windowId) ?? new Set()
    clients.add(ws)
    this._connections.set(windowId, clients)

    ws.on('message', (raw) => {
      const msg = this._parseMessage(raw.toString())
      if (msg) this._onMessage(windowId, msg, ws)
    })

    ws.on('close', () => {
      clients.delete(ws)
      if (clients.size === 0) {
        this._connections.delete(windowId)
        this._onClientDisconnect(windowId)
      }
    })
  }

  // [LAW:single-enforcer] Message validation — the one place we verify incoming messages
  private _parseMessage(raw: string): ClientMessage | null {
    try {
      const msg = JSON.parse(raw)
      if (!msg || typeof msg.type !== 'string') return null
      return msg as ClientMessage
    } catch {
      return null
    }
  }

  private async _handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${this._port}`)
    const pathname = url.pathname

    // Sync fs REST endpoint — used by renderer's sync XHR calls
    if (pathname === '/__bridge/fs' && req.method === 'POST') {
      await handleFsRequest(req, res, _getFsSandbox())
      return
    }

    // Serve renderer bridge bundle (for debugging/direct load)
    if (pathname === '/__bridge/client.js') {
      const bundle = this._rendererBundle ?? '// electron-bridge renderer not built yet'
      res.writeHead(200, { 'Content-Type': 'application/javascript' })
      res.end(bundle)
      return
    }

    // Window routes — serve HTML with injected bridge scripts (no iframe)
    if (pathname === '/') {
      await this._serveInjectedHtml(res, this._findPrimaryRoute())
      return
    }

    const windowMatch = pathname.match(/^\/window\/(\d+)$/)
    if (windowMatch) {
      const windowId = parseInt(windowMatch[1], 10)
      const route = this._routes.get(windowId)
      await this._serveInjectedHtml(res, route ?? null)
      return
    }

    // Static file serving
    const served = await this._serveStatic(pathname, res)
    if (served) return

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }

  private _findPrimaryRoute(): WindowRoute | null {
    // The lowest windowId is the primary window
    let primary: WindowRoute | null = null
    for (const route of this._routes.values()) {
      if (!primary || route.windowId < primary.windowId) {
        primary = route
      }
    }
    return primary
  }

  /**
   * Serve the app's actual HTML file with bridge scripts injected directly.
   * No iframe — the bridge runs in the same context as the app.
   */
  private async _serveInjectedHtml(res: http.ServerResponse, route: WindowRoute | null): Promise<void> {
    const windowId = route?.windowId ?? 1
    const title = route?.title ?? 'electron-bridge'

    // If we have a content path, read and inject into the actual HTML
    if (route?.contentPath) {
      const html = await this._readContentFile(route.contentPath)
      if (html !== null) {
        const injected = this._injectBridgeScripts(html, windowId, route.preloadSource)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(injected)
        return
      }
    }

    // Fallback: serve a minimal shell (for URL-based windows or when no content path)
    const html = this._buildMinimalShell(windowId, title, route?.contentUrl, route?.preloadSource)
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  }

  private async _readContentFile(contentPath: string): Promise<string | null> {
    // Try each static dir to find the HTML file
    for (const dir of this._staticDirs) {
      const filePath = resolve(dir, contentPath.replace(/^\//, ''))
      try {
        return await readFile(filePath, 'utf-8')
      } catch {
        // Try next dir
      }
    }
    // Try as absolute path
    try {
      return await readFile(resolve(contentPath), 'utf-8')
    } catch {
      return null
    }
  }

  /**
   * Inject bridge scripts into an HTML file.
   * Scripts are blocking (not defer/module) so they run before the app's deferred scripts.
   * This ensures window.api is available when app scripts execute.
   */
  private _injectBridgeScripts(html: string, windowId: number, preloadSource?: string): string {
    const bridgeBundle = this._rendererBundle ?? ''

    // Build the preload wrapper if a preload script exists
    const preloadBlock = preloadSource
      ? `<script>(function(){var require=function(m){if(m==="electron")return window.__bridge_renderer__;if(m==="fs")return window.__bridge_renderer__.fs;if(m==="path")return window.__bridge_renderer__.path||{};throw new Error("Cannot require '"+m+"' in browser mode")};${escapeScript(preloadSource)}})()</script>\n`
      : ''

    const processBlock = this._processShim
      ? `<script>${escapeScript(this._processShim)}</script>\n`
      : ''

    const injection =
      processBlock +
      `<script>window.__BRIDGE_WINDOW_ID__=${windowId};</script>\n` +
      `<script>${escapeScript(bridgeBundle)}</script>\n` +
      preloadBlock

    // Inject after <head> tag if present
    const headMatch = html.match(/<head[^>]*>/i)
    if (headMatch) {
      const idx = headMatch.index! + headMatch[0].length
      return html.slice(0, idx) + '\n' + injection + html.slice(idx)
    }

    // No <head>? Inject at the very beginning
    return injection + html
  }

  /** Minimal shell for URL-based windows or when no HTML file is found */
  private _buildMinimalShell(windowId: number, title: string, contentUrl?: string, preloadSource?: string): string {
    const bridgeBundle = this._rendererBundle ?? ''
    const preloadBlock = preloadSource
      ? `<script>(function(){var require=function(m){if(m==="electron")return window.__bridge_renderer__;if(m==="fs")return window.__bridge_renderer__.fs;if(m==="path")return window.__bridge_renderer__.path||{};throw new Error("Cannot require '"+m+"' in browser mode")};${escapeScript(preloadSource)}})()</script>`
      : ''

    const processScript = this._processShim
      ? `\n  <script>${escapeScript(this._processShim)}</script>`
      : ''

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${processScript}
  <script>window.__BRIDGE_WINDOW_ID__=${windowId};</script>
  <script>${escapeScript(bridgeBundle)}</script>
  ${preloadBlock}
</head>
<body>
  ${contentUrl ? `<p>Redirect to: <a href="${escapeHtml(contentUrl)}">${escapeHtml(contentUrl)}</a></p>` : ''}
</body>
</html>`
  }

  private async _serveStatic(pathname: string, res: http.ServerResponse): Promise<boolean> {
    // Prevent directory traversal
    const clean = pathname.replace(/\.\./g, '')

    for (const dir of this._staticDirs) {
      const filePath = resolve(dir, clean.slice(1)) // remove leading /
      try {
        const content = await readFile(filePath)
        const ext = extname(filePath)
        const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': mime })
        res.end(content)
        return true
      } catch {
        // File not in this dir, try next
      }
    }
    return false
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Escape script content so </script> inside code doesn't break the HTML */
function escapeScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script')
}
