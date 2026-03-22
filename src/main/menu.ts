import type { MenuItemConstructorOptions } from '../shared/types.js'
import type { SerializedMenuItem } from '../shared/protocol.js'
import type { BridgeServer } from './server.js'

let _server: BridgeServer | null = null
let _applicationMenu: Menu | null = null

/** @internal Set the server reference */
export function _initMenu(server: BridgeServer): void {
  _server = server
}

export class MenuItem {
  label: string
  type: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  role?: string
  accelerator?: string
  enabled: boolean
  visible: boolean
  checked: boolean
  id?: string
  click?: (menuItem: MenuItem, browserWindow: unknown, event: unknown) => void
  submenu?: Menu

  constructor(options: MenuItemConstructorOptions) {
    this.label = options.label ?? ''
    this.type = options.type ?? 'normal'
    this.role = options.role
    this.accelerator = options.accelerator
    this.enabled = options.enabled !== false
    this.visible = options.visible !== false
    this.checked = options.checked ?? false
    this.id = options.id
    this.click = options.click as MenuItem['click']
    if (options.submenu) {
      this.submenu = Menu.buildFromTemplate(options.submenu)
    }
  }

  /** Serialize for WebSocket transmission */
  _serialize(): SerializedMenuItem {
    return {
      label: this.label,
      type: this.type,
      role: this.role,
      accelerator: this.accelerator,
      enabled: this.enabled,
      visible: this.visible,
      checked: this.checked,
      id: this.id,
      submenu: this.submenu?.items.map(item => item._serialize()),
    }
  }
}

export class Menu {
  items: MenuItem[] = []

  static buildFromTemplate(template: MenuItemConstructorOptions[]): Menu {
    const menu = new Menu()
    menu.items = template.map(item => new MenuItem(item))
    return menu
  }

  static setApplicationMenu(menu: Menu | null): void {
    _applicationMenu = menu
    // Serialize and broadcast to all connected clients
    const template = menu?.items.map(item => item._serialize()) ?? []
    _server?.broadcast({ type: 'menu:set', template })
  }

  static getApplicationMenu(): Menu | null {
    return _applicationMenu
  }

  append(item: MenuItem): void {
    this.items.push(item)
  }

  insert(pos: number, item: MenuItem): void {
    this.items.splice(pos, 0, item)
  }

  getMenuItemById(id: string): MenuItem | null {
    return this._findById(this.items, id)
  }

  popup(options?: { x?: number; y?: number }): void {
    const template = this.items.map(item => item._serialize())
    const position = options ? { x: options.x ?? 0, y: options.y ?? 0 } : undefined
    _server?.broadcast({ type: 'menu:popup', template, position })
  }

  closePopup(): void {
    // Client handles this
  }

  private _findById(items: MenuItem[], id: string): MenuItem | null {
    for (const item of items) {
      if (item.id === id) return item
      if (item.submenu) {
        const found = this._findById(item.submenu.items, id)
        if (found) return found
      }
    }
    return null
  }
}
