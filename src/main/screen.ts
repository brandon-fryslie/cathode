import { EventEmitter } from 'node:events'
import type { Display, Point } from '../shared/types.js'

const DEFAULT_DISPLAY: Display = {
  id: 0,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
  rotation: 0,
  size: { width: 1920, height: 1080 },
  workAreaSize: { width: 1920, height: 1040 },
}

class Screen extends EventEmitter {
  private _display = { ...DEFAULT_DISPLAY }

  /** @internal Update display info from client report */
  _updateFromClient(data: Partial<Display>): void {
    Object.assign(this._display, data)
  }

  getPrimaryDisplay(): Display {
    return { ...this._display }
  }

  getAllDisplays(): Display[] {
    return [this.getPrimaryDisplay()]
  }

  getDisplayNearestPoint(_point: Point): Display {
    return this.getPrimaryDisplay()
  }

  getDisplayMatching(_rect: { x: number; y: number; width: number; height: number }): Display {
    return this.getPrimaryDisplay()
  }

  getCursorScreenPoint(): Point {
    return { x: 0, y: 0 }
  }
}

export const screen = new Screen()
