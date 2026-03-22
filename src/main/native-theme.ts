import { EventEmitter } from 'node:events'

class NativeTheme extends EventEmitter {
  private _themeSource: 'system' | 'light' | 'dark' = 'system'
  private _shouldUseDarkColors = false

  get themeSource(): 'system' | 'light' | 'dark' { return this._themeSource }
  set themeSource(val: 'system' | 'light' | 'dark') {
    this._themeSource = val
    this.emit('updated')
  }

  get shouldUseDarkColors(): boolean {
    if (this._themeSource === 'dark') return true
    if (this._themeSource === 'light') return false
    return this._shouldUseDarkColors
  }

  get shouldUseHighContrastColors(): boolean { return false }
  get shouldUseInvertedColorScheme(): boolean { return false }

  /** @internal Update from client's prefers-color-scheme report */
  _updateFromClient(prefersDark: boolean): void {
    this._shouldUseDarkColors = prefersDark
    this.emit('updated')
  }
}

export const nativeTheme = new NativeTheme()
