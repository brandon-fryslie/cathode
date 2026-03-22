/**
 * Clipboard module — server-side.
 * Clipboard operations must delegate to the browser client via WS.
 * For server-only use, we provide basic read/write via a local buffer.
 */

let _textBuffer = ''

export const clipboard = {
  readText(): string {
    return _textBuffer
  },

  writeText(text: string): void {
    _textBuffer = text
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
