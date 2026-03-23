import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs'
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

  it('rmSync works', async () => {
    const dir = join(TEST_DIR, 'rest-rmSync-dir')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'child.txt'), 'x')
    const res = await postSync('rmSync', [dir, { recursive: true, force: true }])
    expect(res.status).toBe(200)
    const exists = await postSync('existsSync', [dir])
    expect(exists.body.result).toBe(false)
  })

  it('appendFileSync appends to a file', async () => {
    const filePath = join(TEST_DIR, 'rest-append.txt')
    await postSync('writeFileSync', [filePath, 'hello'])
    const res = await postSync('appendFileSync', [filePath, ' world'])
    expect(res.status).toBe(200)
    const read = await postSync('readFileSync', [filePath, 'utf-8'])
    expect(read.body.result).toBe('hello world')
  })

  it('lstatSync works', async () => {
    const filePath = join(TEST_DIR, 'rest-append.txt')
    const res = await postSync('lstatSync', [filePath])
    expect(res.status).toBe(200)
    const stats = res.body.result as SerializedStats
    expect(stats.isFile).toBe(true)
    expect(stats.isSymbolicLink).toBe(false)
  })

  it('accessSync succeeds for existing file', async () => {
    const filePath = join(TEST_DIR, 'rest-append.txt')
    const res = await postSync('accessSync', [filePath])
    expect(res.status).toBe(200)
  })

  it('accessSync fails for missing file', async () => {
    const res = await postSync('accessSync', [join(TEST_DIR, 'nope-access.txt')])
    expect(res.status).toBe(500)
    expect(res.body.error?.code).toBe('ENOENT')
  })

  it('realpathSync resolves real path', async () => {
    const filePath = join(TEST_DIR, 'rest-append.txt')
    const res = await postSync('realpathSync', [filePath])
    expect(res.status).toBe(200)
    expect(typeof res.body.result).toBe('string')
    expect((res.body.result as string).length).toBeGreaterThan(0)
  })

  it('truncateSync truncates a file', async () => {
    const filePath = join(TEST_DIR, 'rest-truncate.txt')
    writeFileSync(filePath, 'long content here')
    const res = await postSync('truncateSync', [filePath, 4])
    expect(res.status).toBe(200)
    const read = await postSync('readFileSync', [filePath, 'utf-8'])
    expect(read.body.result).toBe('long')
  })

  it('chmodSync works', async () => {
    const filePath = join(TEST_DIR, 'rest-chmod.txt')
    writeFileSync(filePath, 'chmod test')
    const res = await postSync('chmodSync', [filePath, 0o644])
    expect(res.status).toBe(200)
  })

  it('symlinkSync and readlinkSync work', async () => {
    const target = join(TEST_DIR, 'rest-symlink-target.txt')
    const link = join(TEST_DIR, 'rest-symlink-link.txt')
    writeFileSync(target, 'symlink target')
    const symRes = await postSync('symlinkSync', [target, link])
    expect(symRes.status).toBe(200)
    const readRes = await postSync('readlinkSync', [link])
    expect(readRes.status).toBe(200)
    expect(readRes.body.result).toBe(realpathSync(target))
    // lstat should show it's a symlink
    const lstatRes = await postSync('lstatSync', [link])
    expect((lstatRes.body.result as SerializedStats).isSymbolicLink).toBe(true)
  })

  it('openSync/writeSync/readSync/closeSync work for fd operations', async () => {
    const filePath = join(TEST_DIR, 'rest-fd-ops.txt')
    writeFileSync(filePath, '')
    // Open
    const openRes = await postSync('openSync', [filePath, 'w+'])
    expect(openRes.status).toBe(200)
    const fd = openRes.body.result as number
    expect(typeof fd).toBe('number')
    // Write
    const writeRes = await postSync('writeSync', [fd, 'fd data', 0, 'utf-8'])
    expect(writeRes.status).toBe(200)
    // Read
    const readRes = await postSync('readSync', [fd, 7, 0])
    expect(readRes.status).toBe(200)
    const readResult = readRes.body.result as { bytesRead: number; data: number[] }
    expect(readResult.bytesRead).toBe(7)
    const text = Buffer.from(readResult.data).toString('utf-8')
    expect(text).toBe('fd data')
    // Close
    const closeRes = await postSync('closeSync', [fd])
    expect(closeRes.status).toBe(200)
  })

  it('readFileSync binary returns number array', async () => {
    const filePath = join(TEST_DIR, 'rest-binary.bin')
    writeFileSync(filePath, Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]))
    const res = await postSync('readFileSync', [filePath])
    expect(res.status).toBe(200)
    expect(res.body.result).toEqual([0xDE, 0xAD, 0xBE, 0xEF])
  })
})
