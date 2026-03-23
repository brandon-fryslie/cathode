import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import http from 'node:http'
import { BridgeServer } from '../src/main/server.js'
import { _initFs } from '../src/main/fs-service.js'
import type { SerializedStats, SerializedDirent } from '../src/shared/types.js'

const TEST_DIR = join(tmpdir(), 'electron-bridge-fs-rest-test-' + Date.now())
const PORT = 3456

let server: BridgeServer

function postSync(method: string, args: unknown[]): { status: number; body: { result?: unknown; error?: { code: string; message: string; path?: string } } } {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const payload = JSON.stringify({ method, args })
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: '/__bridge/fs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        resolve({ status: res.statusCode!, body: JSON.parse(text) })
      })
    })
    req.on('error', reject)
    req.end(payload)
  }) as unknown as { status: number; body: { result?: unknown; error?: { code: string; message: string; path?: string } } }
}

describe('fs-rest endpoint', () => {
  beforeAll(async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    _initFs([TEST_DIR])
    server = new BridgeServer(PORT)
    await server.listen()
  })

  afterAll(async () => {
    await server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('readFileSync returns file contents', async () => {
    const filePath = join(TEST_DIR, 'rest-test.txt')
    writeFileSync(filePath, 'rest content')
    const res = await postSync('readFileSync', [filePath, 'utf-8'])
    expect(res.status).toBe(200)
    expect(res.body.result).toBe('rest content')
  })

  it('writeFileSync creates a file', async () => {
    const filePath = join(TEST_DIR, 'rest-write.txt')
    const res = await postSync('writeFileSync', [filePath, 'written via rest'])
    expect(res.status).toBe(200)
    const read = await postSync('readFileSync', [filePath, 'utf-8'])
    expect(read.body.result).toBe('written via rest')
  })

  it('existsSync returns true for existing file', async () => {
    const filePath = join(TEST_DIR, 'rest-test.txt')
    const res = await postSync('existsSync', [filePath])
    expect(res.status).toBe(200)
    expect(res.body.result).toBe(true)
  })

  it('existsSync returns false for missing file', async () => {
    const res = await postSync('existsSync', [join(TEST_DIR, 'nope.txt')])
    expect(res.status).toBe(200)
    expect(res.body.result).toBe(false)
  })

  it('statSync returns serialized stats', async () => {
    const filePath = join(TEST_DIR, 'rest-test.txt')
    const res = await postSync('statSync', [filePath])
    expect(res.status).toBe(200)
    const stats = res.body.result as SerializedStats
    expect(stats.isFile).toBe(true)
    expect(stats.isDirectory).toBe(false)
    expect(stats.size).toBeGreaterThan(0)
    expect(stats.mtimeMs).toBeGreaterThan(0)
  })

  it('readdirSync lists directory', async () => {
    const dir = join(TEST_DIR, 'rest-dir')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.txt'), '')
    writeFileSync(join(dir, 'b.txt'), '')
    const res = await postSync('readdirSync', [dir])
    expect(res.status).toBe(200)
    expect(res.body.result).toContain('a.txt')
    expect(res.body.result).toContain('b.txt')
  })

  it('readdirSync with withFileTypes returns SerializedDirent[]', async () => {
    const dir = join(TEST_DIR, 'rest-dir')
    const res = await postSync('readdirSync', [dir, { withFileTypes: true }])
    expect(res.status).toBe(200)
    const entries = res.body.result as SerializedDirent[]
    const a = entries.find(e => e.name === 'a.txt')
    expect(a).toBeDefined()
    expect(a!.isFile).toBe(true)
  })

  it('returns ENOENT error for missing file', async () => {
    const res = await postSync('readFileSync', [join(TEST_DIR, 'missing.txt'), 'utf-8'])
    expect(res.status).toBe(500)
    expect(res.body.error?.code).toBe('ENOENT')
  })

  it('rejects paths outside sandbox', async () => {
    const res = await postSync('readFileSync', ['/etc/passwd', 'utf-8'])
    expect(res.status).toBe(500)
    expect(res.body.error?.message).toContain('Path outside allowed roots')
  })

  it('rejects unknown method', async () => {
    const res = await postSync('fakeMethod', ['/whatever'])
    expect(res.status).toBe(400)
    expect(res.body.error?.code).toBe('UNKNOWN_METHOD')
  })

  it('mkdirSync and rmdirSync work', async () => {
    const dir = join(TEST_DIR, 'rest-mkdir')
    const mkRes = await postSync('mkdirSync', [dir])
    expect(mkRes.status).toBe(200)
    const statRes = await postSync('statSync', [dir])
    expect((statRes.body.result as SerializedStats).isDirectory).toBe(true)
    const rmRes = await postSync('rmdirSync', [dir, { recursive: true }])
    expect(rmRes.status).toBe(200)
  })

  it('renameSync works', async () => {
    const src = join(TEST_DIR, 'rest-rename-src.txt')
    const dest = join(TEST_DIR, 'rest-rename-dest.txt')
    writeFileSync(src, 'rename me')
    const res = await postSync('renameSync', [src, dest])
    expect(res.status).toBe(200)
    const read = await postSync('readFileSync', [dest, 'utf-8'])
    expect(read.body.result).toBe('rename me')
  })

  it('copyFileSync works', async () => {
    const src = join(TEST_DIR, 'rest-rename-dest.txt')
    const dest = join(TEST_DIR, 'rest-copy-dest.txt')
    const res = await postSync('copyFileSync', [src, dest])
    expect(res.status).toBe(200)
    const read = await postSync('readFileSync', [dest, 'utf-8'])
    expect(read.body.result).toBe('rename me')
  })

  it('unlinkSync works', async () => {
    const filePath = join(TEST_DIR, 'rest-copy-dest.txt')
    const res = await postSync('unlinkSync', [filePath])
    expect(res.status).toBe(200)
    const exists = await postSync('existsSync', [filePath])
    expect(exists.body.result).toBe(false)
  })
})
