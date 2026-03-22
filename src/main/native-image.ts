/** NativeImage — server-side image handling using Buffers and data URLs */
export class NativeImage {
  private _buffer: Buffer
  private _size: { width: number; height: number }

  private constructor(buffer: Buffer, size = { width: 0, height: 0 }) {
    this._buffer = buffer
    this._size = size
  }

  static createEmpty(): NativeImage {
    return new NativeImage(Buffer.alloc(0))
  }

  static createFromBuffer(buffer: Buffer, options?: { width?: number; height?: number; scaleFactor?: number }): NativeImage {
    return new NativeImage(buffer, { width: options?.width ?? 0, height: options?.height ?? 0 })
  }

  static createFromDataURL(dataURL: string): NativeImage {
    const match = dataURL.match(/^data:image\/\w+;base64,(.+)$/)
    const buffer = match ? Buffer.from(match[1], 'base64') : Buffer.alloc(0)
    return new NativeImage(buffer)
  }

  static async createFromPath(filePath: string): Promise<NativeImage> {
    try {
      const { readFile } = await import('node:fs/promises')
      const buffer = await readFile(filePath)
      return new NativeImage(buffer)
    } catch {
      return NativeImage.createEmpty()
    }
  }

  isEmpty(): boolean { return this._buffer.length === 0 }
  getSize(): { width: number; height: number } { return { ...this._size } }
  getAspectRatio(): number {
    return this._size.height > 0 ? this._size.width / this._size.height : 1
  }

  toDataURL(): string {
    if (this._buffer.length === 0) return ''
    return `data:image/png;base64,${this._buffer.toString('base64')}`
  }

  toPNG(): Buffer { return this._buffer }
  toJPEG(quality = 80): Buffer { return this._buffer } // Can't re-encode server-side without deps
  toBitmap(): Buffer { return this._buffer }

  resize(_options: { width?: number; height?: number; quality?: string }): NativeImage {
    // Can't resize server-side without image processing deps — return self
    return this
  }

  crop(_rect: { x: number; y: number; width: number; height: number }): NativeImage {
    return this
  }
}

export const nativeImage = {
  createEmpty: NativeImage.createEmpty,
  createFromBuffer: NativeImage.createFromBuffer,
  createFromDataURL: NativeImage.createFromDataURL,
  createFromPath: NativeImage.createFromPath,
}
