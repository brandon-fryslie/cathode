// [LAW:single-enforcer] Path validation delegated to PathSandbox (same instance as fs-service).
// This module handles synchronous fs REST requests from the renderer.

import type http from 'node:http'
import * as fsSync from 'node:fs'
import { PathSandbox } from './fs-sandbox.js'
import { serializeStats, serializeDirent } from './fs-service.js'

interface FsRequest {
  method: string
  args: unknown[]
}

interface FsResponse {
  result?: unknown
  error?: { code: string; message: string; path?: string }
}

type FsHandler = (args: unknown[], sandbox: PathSandbox) => unknown

// [LAW:dataflow-not-control-flow] Every method has a handler — dispatch is by data, not branching.
const METHODS: Record<string, FsHandler> = {
  readFileSync(args, sandbox) {
    const [filePath, encoding] = args as [string, string?]
    const resolved = sandbox.validate(filePath)
    if (encoding) {
      return fsSync.readFileSync(resolved, encoding as BufferEncoding)
    }
    return Array.from(fsSync.readFileSync(resolved))
  },

  writeFileSync(args, sandbox) {
    const [filePath, data, options] = args as [string, string, { encoding?: string; flag?: string; mode?: number }?]
    const resolved = sandbox.validate(filePath)
    fsSync.writeFileSync(resolved, data, options ?? undefined)
  },

  statSync(args, sandbox) {
    const [filePath] = args as [string]
    const resolved = sandbox.validate(filePath)
    return serializeStats(fsSync.statSync(resolved))
  },

  lstatSync(args, sandbox) {
    const [filePath] = args as [string]
    const resolved = sandbox.validate(filePath)
    return serializeStats(fsSync.lstatSync(resolved))
  },

  existsSync(args, sandbox) {
    const [filePath] = args as [string]
    const resolved = sandbox.validate(filePath)
    return fsSync.existsSync(resolved)
  },

  accessSync(args, sandbox) {
    const [filePath, mode] = args as [string, number?]
    const resolved = sandbox.validate(filePath)
    fsSync.accessSync(resolved, mode)
  },

  readdirSync(args, sandbox) {
    const [dirPath, options] = args as [string, { withFileTypes?: boolean }?]
    const resolved = sandbox.validate(dirPath)
    if (options?.withFileTypes) {
      return fsSync.readdirSync(resolved, { withFileTypes: true }).map(serializeDirent)
    }
    return fsSync.readdirSync(resolved)
  },

  mkdirSync(args, sandbox) {
    const [dirPath, options] = args as [string, { recursive?: boolean }?]
    const resolved = sandbox.validate(dirPath)
    return fsSync.mkdirSync(resolved, options)
  },

  rmdirSync(args, sandbox) {
    const [dirPath, options] = args as [string, { recursive?: boolean }?]
    const resolved = sandbox.validate(dirPath)
    fsSync.rmSync(resolved, options)
  },

  renameSync(args, sandbox) {
    const [oldPath, newPath] = args as [string, string]
    const resolvedOld = sandbox.validate(oldPath)
    const resolvedNew = sandbox.validate(newPath)
    fsSync.renameSync(resolvedOld, resolvedNew)
  },

  copyFileSync(args, sandbox) {
    const [src, dest] = args as [string, string]
    const resolvedSrc = sandbox.validate(src)
    const resolvedDest = sandbox.validate(dest)
    fsSync.copyFileSync(resolvedSrc, resolvedDest)
  },

  unlinkSync(args, sandbox) {
    const [filePath] = args as [string]
    const resolved = sandbox.validate(filePath)
    fsSync.unlinkSync(resolved)
  },
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

export async function handleFsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sandbox: PathSandbox,
): Promise<void> {
  const body = await readBody(req)
  let parsed: FsRequest
  try {
    parsed = JSON.parse(body)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'PARSE_ERROR', message: 'Invalid JSON body' } }))
    return
  }

  const handler = METHODS[parsed.method]
  if (!handler) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'UNKNOWN_METHOD', message: `Unknown fs method: ${parsed.method}` } }))
    return
  }

  try {
    const result = handler(parsed.args ?? [], sandbox)
    const response: FsResponse = { result: result === undefined ? null : result }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(response))
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    const response: FsResponse = {
      error: {
        code: e.code ?? 'UNKNOWN',
        message: e.message,
        path: e.path,
      },
    }
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(response))
  }
}
