/**
 * Clipboard module — server-side.
 * Uses system clipboard via child_process for actual copy/paste.
 * Falls back to in-memory buffer if system clipboard is unavailable.
 */

import { execSync } from 'node:child_process'

function writeToSystem(text: string): boolean {
  try {
    const escaped = text.replace(/'/g, "'\\''")
    switch (process.platform) {
      case 'darwin':
        execSync(`printf '%s' '${escaped}' | pbcopy`)
        return true
      case 'linux':
        execSync(`printf '%s' '${escaped}' | xclip -selection clipboard`)
        return true
      case 'win32':
        // clip.exe reads from stdin
        execSync(`printf '%s' '${escaped}' | clip`)
        return true
      default:
        return false
    }
  } catch {
    return false
  }
}

function readFromSystem(): string | null {
  try {
    switch (process.platform) {
      case 'darwin':
        return execSync('pbpaste', { encoding: 'utf-8' })
      case 'linux':
        return execSync('xclip -selection clipboard -o', { encoding: 'utf-8' })
      case 'win32':
        return execSync('powershell -command Get-Clipboard', { encoding: 'utf-8' }).trimEnd()
      default:
        return null
    }
  } catch {
    return null
  }
}

let _textBuffer = ''

export const clipboard = {
  readText(): string {
    return readFromSystem() ?? _textBuffer
  },

  writeText(text: string): void {
    _textBuffer = text
    writeToSystem(text)
  },

  readHTML(): string {
    return ''
  },

  writeHTML(_markup: string): void {
    console.warn('[electron-bridge] clipboard.writeHTML() has limited support in web mode')
  },

  readRTF(): string { return '' },
  writeRTF(_text: string): void {},

  readImage(): null { return null },
  writeImage(_image: unknown): void {},

  readBookmark(): { title: string; url: string } {
    return { title: '', url: '' }
  },

  writeBookmark(_title: string, _url: string): void {},

  clear(): void {
    _textBuffer = ''
  },

  availableFormats(): string[] {
    return _textBuffer ? ['text/plain'] : []
  },

  has(format: string): boolean {
    return format === 'text/plain' && _textBuffer.length > 0
  },
}
