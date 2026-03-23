import { test, expect } from '@playwright/test'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'

const TEST_DIR = join(tmpdir(), 'electron-bridge-e2e-' + Date.now())
const PORT = 3999

let serverProcess: ChildProcess

// Start the bridge server with a test app that loads our fs-test.html
test.beforeAll(async () => {
  mkdirSync(TEST_DIR, { recursive: true })

  // Create a minimal "electron app" that loads our test HTML
  const { writeFileSync } = await import('node:fs')
  const htmlPath = resolve('test/e2e/fixtures/fs-test.html').replace(/\\/g, '\\\\')
  writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ name: 'e2e-test', main: 'main.js' }))
  writeFileSync(join(TEST_DIR, 'main.js'), `
    const { app, BrowserWindow, addFsRoot } = require('electron');
    addFsRoot('${TEST_DIR.replace(/\\/g, '\\\\')}');
    app.on('ready', () => {
      const win = new BrowserWindow({ width: 800, height: 600 });
      win.loadFile('${htmlPath}');
    });
  `)

  // Start the CLI in a child process
  serverProcess = spawn('node', [resolve('dist/cli.cjs'), TEST_DIR], {
    env: { ...process.env, ELECTRON_BRIDGE_PORT: String(PORT) },
    stdio: 'pipe',
  })

  // Collect output for debugging
  let serverOutput = ''
  serverProcess.stdout?.on('data', (d: Buffer) => { serverOutput += d.toString() })
  serverProcess.stderr?.on('data', (d: Buffer) => { serverOutput += d.toString() })

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout. Output:\n' + serverOutput)), 10000)
    const checkOutput = (data: Buffer) => {
      if (data.toString().includes('Server listening')) {
        clearTimeout(timeout)
        resolve()
      }
    }
    serverProcess.stdout?.on('data', checkOutput)
    serverProcess.stderr?.on('data', checkOutput)
    serverProcess.on('error', (err) => { clearTimeout(timeout); reject(err) })
    serverProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`Server exited with code ${code}. Output:\n${serverOutput}`))
      }
    })
  })
})

test.afterAll(async () => {
  serverProcess?.kill()
  // Give it a moment to clean up
  await new Promise(r => setTimeout(r, 500))
  rmSync(TEST_DIR, { recursive: true, force: true })
})

test('fs sync API works in the browser', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  // Wait for the bridge to connect (WebSocket)
  await page.waitForTimeout(1000)

  // Run the fs tests, passing the test directory
  const results = await page.evaluate((testDir) => {
    return (window as unknown as { runFsTests: (dir: string) => Record<string, unknown> }).runFsTests(testDir)
  }, TEST_DIR)

  // Verify all results
  expect(results.readFileSync).toBe('hello from browser')
  expect(results.existsSync_true).toBe(true)
  expect(results.existsSync_false).toBe(false)
  expect(results.statSync_isFile).toBe(true)
  expect(results.statSync_isDirectory).toBe(false)
  expect(results.statSync_size).toBeGreaterThan(0)
  expect(results.readdirSync).toContain('a.txt')
  expect(results.readdirSync).toContain('b.txt')
  expect(results.appendFileSync).toBe('hello from browser appended')
  expect(results.renameSync).toBe(true)
  expect(results.copyFileSync).toBe('hello from browser appended')
  expect(results.realpathSync).toBe('string')
  expect(results.truncateSync).toBe('hello')
  expect(results.unlinkSync).toBe(true)
  expect(results.enoent_code).toBe('ENOENT')
  expect(results.sandbox_rejected).toBe(true)
  expect(results.constants_F_OK).toBe(0)
  expect(results.constants_R_OK).toBe(4)
  expect(results.promises_exists).toBe(true)
  expect(results.promises_readFile).toBe(true)

  // Check withFileTypes
  const entries = results.readdirSync_withFileTypes as Array<{ name: string; isFile: boolean }>
  expect(entries.find(e => e.name === 'a.txt')?.isFile).toBe(true)

  // Ensure no errors in any test
  const errorKeys = Object.keys(results).filter(k => k.endsWith('_error'))
  expect(errorKeys).toEqual([])
})

test('require("fs") is available in the browser context', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)
  await page.waitForTimeout(1000)

  const hasFsModule = await page.evaluate(() => {
    const fs = require('fs')
    return {
      hasReadFileSync: typeof fs.readFileSync === 'function',
      hasWriteFileSync: typeof fs.writeFileSync === 'function',
      hasExistsSync: typeof fs.existsSync === 'function',
      hasStatSync: typeof fs.statSync === 'function',
      hasPromises: typeof fs.promises === 'object',
      hasConstants: typeof fs.constants === 'object',
      hasMkdirSync: typeof fs.mkdirSync === 'function',
      hasReaddirSync: typeof fs.readdirSync === 'function',
      hasAppendFileSync: typeof fs.appendFileSync === 'function',
      hasChmodSync: typeof fs.chmodSync === 'function',
      hasSymlinkSync: typeof fs.symlinkSync === 'function',
      hasRealpathSync: typeof fs.realpathSync === 'function',
    }
  })

  for (const [key, value] of Object.entries(hasFsModule)) {
    expect(value, `${key} should be true`).toBe(true)
  }
})
