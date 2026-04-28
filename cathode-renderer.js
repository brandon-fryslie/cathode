"use strict";
var __bridge_renderer_raw__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/renderer/index.ts
  var renderer_exports = {};
  __export(renderer_exports, {
    BridgeConnection: () => BridgeConnection,
    FsError: () => FsError,
    bridgeFs: () => bridgeFs,
    contextBridge: () => contextBridge,
    fs: () => fs_sync_default,
    ipcRenderer: () => ipcRenderer
  });

  // src/shared/events.ts
  var ElectronEvent = class {
    _defaultPrevented = false;
    returnValue = void 0;
    get defaultPrevented() {
      return this._defaultPrevented;
    }
    preventDefault() {
      this._defaultPrevented = true;
    }
  };
  var BrowserEventEmitter = class {
    _listeners = /* @__PURE__ */ new Map();
    on(event, listener) {
      const listeners = this._listeners.get(event) ?? [];
      listeners.push(listener);
      this._listeners.set(event, listeners);
      return this;
    }
    once(event, listener) {
      const wrapped = (...args) => {
        this.off(event, wrapped);
        listener(...args);
      };
      return this.on(event, wrapped);
    }
    off(event, listener) {
      const listeners = this._listeners.get(event);
      if (listeners) {
        const idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
        if (listeners.length === 0) this._listeners.delete(event);
      }
      return this;
    }
    addListener(event, listener) {
      return this.on(event, listener);
    }
    removeListener(event, listener) {
      return this.off(event, listener);
    }
    removeAllListeners(event) {
      if (event !== void 0) {
        this._listeners.delete(event);
      } else {
        this._listeners.clear();
      }
      return this;
    }
    emit(event, ...args) {
      const listeners = this._listeners.get(event);
      if (!listeners || listeners.length === 0) return false;
      for (const listener of [...listeners]) {
        listener(...args);
      }
      return true;
    }
    listenerCount(event) {
      return this._listeners.get(event)?.length ?? 0;
    }
  };

  // src/renderer/connection.ts
  var BridgeConnection = class {
    _ws = null;
    _windowId;
    _url;
    _handler;
    _reconnectDelay = 250;
    _maxReconnectDelay = 8e3;
    _closed = false;
    _queue = [];
    _readyPromise;
    _resolveReady;
    constructor(windowId, handler) {
      this._windowId = windowId;
      this._handler = handler;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      this._url = `${protocol}//${location.host}/__bridge/ws?windowId=${windowId}`;
      this._readyPromise = new Promise((resolve) => {
        this._resolveReady = resolve;
      });
      this._connect();
    }
    get windowId() {
      return this._windowId;
    }
    /** Resolves when the WebSocket is first connected */
    whenReady() {
      return this._readyPromise;
    }
    send(message) {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify(message));
      } else {
        this._queue.push(message);
      }
    }
    _flushQueue() {
      const queued = this._queue.splice(0);
      for (const msg of queued) {
        this.send(msg);
      }
    }
    close() {
      this._closed = true;
      this._ws?.close();
    }
    _connect() {
      if (this._closed) return;
      const ws = new WebSocket(this._url);
      this._ws = ws;
      ws.onopen = () => {
        this._reconnectDelay = 250;
        this.send({ type: "client:ready", windowId: this._windowId });
        this._flushQueue();
        this._resolveReady();
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handler(msg);
        } catch {
        }
      };
      ws.onclose = () => {
        if (this._closed) return;
        setTimeout(() => this._connect(), this._reconnectDelay);
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
      };
      ws.onerror = () => {
      };
    }
  };
  function detectWindowId() {
    return globalThis.__BRIDGE_WINDOW_ID__ ?? 1;
  }

  // src/renderer/ipc-renderer.ts
  var IpcRendererImpl = class extends BrowserEventEmitter {
    _connection = null;
    _pendingInvokes = /* @__PURE__ */ new Map();
    _idCounter = 0;
    _handlers;
    constructor() {
      super();
      this._handlers = {
        "ipc:message": (msg) => {
          const event = Object.assign(new ElectronEvent(), { ports: [] });
          this.emit(msg.channel, event, ...msg.args);
        },
        "ipc:invoke:result": (msg) => {
          const pending = this._pendingInvokes.get(msg.id);
          if (!pending) return;
          this._pendingInvokes.delete(msg.id);
          if (msg.error !== void 0) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        },
        "dialog:request": () => {
        },
        "window:command": () => {
        },
        "menu:set": () => {
        },
        "menu:popup": () => {
        },
        "app:event": () => {
        }
      };
    }
    /** @internal Initialize the WebSocket connection. Called once on import. */
    _init() {
      if (this._connection) return;
      const windowId = detectWindowId();
      this._connection = new BridgeConnection(windowId, (msg) => {
        const handler = this._handlers[msg.type];
        handler(msg);
      });
    }
    /** @internal Replace a message handler (used by dialog-ui, menu-ui, etc.) */
    _setHandler(type, handler) {
      this._handlers[type] = handler;
    }
    /** @internal Access the connection for direct sends */
    get _conn() {
      return this._connection;
    }
    send(channel, ...args) {
      this._connection?.send({
        type: "ipc:send",
        channel,
        args,
        windowId: this._connection.windowId
      });
    }
    invoke(channel, ...args) {
      return new Promise((resolve, reject) => {
        const id = String(++this._idCounter);
        this._pendingInvokes.set(id, { resolve, reject });
        this._connection?.send({
          type: "ipc:invoke",
          id,
          channel,
          args,
          windowId: this._connection?.windowId ?? 1
        });
      });
    }
    sendSync(_channel, ..._args) {
      throw new Error(
        "[electron-bridge] ipcRenderer.sendSync() is not supported in web mode. Use ipcRenderer.invoke() instead (recommended by Electron docs as well)."
      );
    }
    postMessage(channel, message, _transfer) {
      this.send(channel, message);
    }
    sendToHost(channel, ...args) {
      this.send(channel, ...args);
    }
  };
  var ipcRenderer = new IpcRendererImpl();

  // src/renderer/context-bridge.ts
  function deepClone(obj) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(obj);
      } catch {
      }
    }
    return cloneWithFunctions(obj);
  }
  function cloneWithFunctions(obj, seen = /* @__PURE__ */ new WeakSet()) {
    if (obj === null || typeof obj !== "object") return obj;
    if (typeof obj === "function") return obj;
    if (seen.has(obj)) return void 0;
    seen.add(obj);
    if (Array.isArray(obj)) {
      return obj.map((item) => cloneWithFunctions(item, seen));
    }
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = cloneWithFunctions(value, seen);
    }
    return result;
  }
  function deepFreeze(obj) {
    if (obj === null || typeof obj !== "object" || typeof obj === "function") return obj;
    Object.freeze(obj);
    for (const value of Object.values(obj)) {
      if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
        deepFreeze(value);
      }
    }
    return obj;
  }
  var contextBridge = {
    // [LAW:dataflow-not-control-flow] Always assign — no guards on whether isolation exists.
    exposeInMainWorld(apiKey, api) {
      const cloned = deepClone(api);
      const frozen = typeof cloned === "object" && cloned !== null ? deepFreeze(cloned) : cloned;
      globalThis[apiKey] = frozen;
    },
    exposeInIsolatedWorld(_worldId, apiKey, api) {
      this.exposeInMainWorld(apiKey, api);
    }
  };

  // src/renderer/bridge-fs.ts
  var FsError = class extends Error {
    code;
    path;
    constructor(message, code, fsPath) {
      super(message);
      this.name = "FsError";
      this.code = code;
      this.path = fsPath;
    }
  };
  function parseFsError(err) {
    const raw = err instanceof Error ? err.message : String(err);
    try {
      const data = JSON.parse(raw);
      return new FsError(data.message ?? raw, data.code ?? "UNKNOWN", data.path);
    } catch {
      return new FsError(raw, "UNKNOWN");
    }
  }
  async function invoke(channel, ...args) {
    try {
      return await ipcRenderer.invoke(channel, ...args);
    } catch (err) {
      throw parseFsError(err);
    }
  }
  var bridgeFs = {
    readFile(filePath, encoding) {
      return invoke("bridge:fs:readFile", filePath, encoding);
    },
    writeFile(filePath, data, options) {
      return invoke("bridge:fs:writeFile", filePath, data, options);
    },
    stat(filePath) {
      return invoke("bridge:fs:stat", filePath);
    },
    lstat(filePath) {
      return invoke("bridge:fs:lstat", filePath);
    },
    access(filePath, mode) {
      return invoke("bridge:fs:access", filePath, mode);
    },
    readdir(filePath, options) {
      return invoke("bridge:fs:readdir", filePath, options);
    },
    mkdir(dirPath, options) {
      return invoke("bridge:fs:mkdir", dirPath, options);
    },
    rm(filePath, options) {
      return invoke("bridge:fs:rm", filePath, options);
    },
    rename(oldPath, newPath) {
      return invoke("bridge:fs:rename", oldPath, newPath);
    },
    copyFile(src, dest) {
      return invoke("bridge:fs:copyFile", src, dest);
    },
    unlink(filePath) {
      return invoke("bridge:fs:unlink", filePath);
    },
    appendFile(filePath, data, options) {
      return invoke("bridge:fs:appendFile", filePath, data, options);
    },
    chmod(filePath, mode) {
      return invoke("bridge:fs:chmod", filePath, mode);
    },
    chown(filePath, uid, gid) {
      return invoke("bridge:fs:chown", filePath, uid, gid);
    },
    symlink(target, linkPath, type) {
      return invoke("bridge:fs:symlink", target, linkPath, type);
    },
    readlink(filePath) {
      return invoke("bridge:fs:readlink", filePath);
    },
    realpath(filePath) {
      return invoke("bridge:fs:realpath", filePath);
    },
    truncate(filePath, len) {
      return invoke("bridge:fs:truncate", filePath, len);
    },
    async watch(filePath, options, listener) {
      const watchId = await invoke("bridge:fs:watch", filePath, options);
      if (listener) {
        const handler = (_event, id, eventType, filename) => {
          if (id === watchId) listener(eventType, filename);
        };
        ipcRenderer.on("bridge:fs:watch:event", handler);
        return {
          watchId,
          async close() {
            ipcRenderer.removeListener("bridge:fs:watch:event", handler);
            await invoke("bridge:fs:unwatch", watchId);
          }
        };
      }
      return {
        watchId,
        async close() {
          await invoke("bridge:fs:unwatch", watchId);
        }
      };
    }
  };

  // src/renderer/fs-sync.ts
  function callSync(method, args) {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/__bridge/fs", false);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ method, args }));
    const response = JSON.parse(xhr.responseText);
    if (xhr.status !== 200 || response.error) {
      const err = response.error ?? { code: "UNKNOWN", message: "Unknown fs error" };
      throw new FsError(err.message, err.code, err.path);
    }
    return response.result;
  }
  var constants = {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    COPYFILE_EXCL: 1,
    COPYFILE_FICLONE: 2,
    COPYFILE_FICLONE_FORCE: 4
  };
  function readFileSync(filePath, encoding) {
    const enc = typeof encoding === "object" ? encoding.encoding : encoding;
    return callSync("readFileSync", [filePath, enc]);
  }
  function writeFileSync(filePath, data, options) {
    const opts = typeof options === "string" ? { encoding: options } : options;
    callSync("writeFileSync", [filePath, data, opts]);
  }
  function appendFileSync(filePath, data, options) {
    const opts = typeof options === "string" ? { encoding: options } : options;
    callSync("appendFileSync", [filePath, data, opts]);
  }
  function existsSync(filePath) {
    return callSync("existsSync", [filePath]);
  }
  function statSync(filePath) {
    return callSync("statSync", [filePath]);
  }
  function lstatSync(filePath) {
    return callSync("lstatSync", [filePath]);
  }
  function accessSync(filePath, mode) {
    callSync("accessSync", [filePath, mode]);
  }
  function readdirSync(dirPath, options) {
    return callSync("readdirSync", [dirPath, options]);
  }
  function mkdirSync(dirPath, options) {
    return callSync("mkdirSync", [dirPath, options]);
  }
  function rmdirSync(dirPath, options) {
    callSync("rmdirSync", [dirPath, options]);
  }
  function rmSync(dirPath, options) {
    callSync("rmSync", [dirPath, options]);
  }
  function renameSync(oldPath, newPath) {
    callSync("renameSync", [oldPath, newPath]);
  }
  function copyFileSync(src, dest) {
    callSync("copyFileSync", [src, dest]);
  }
  function unlinkSync(filePath) {
    callSync("unlinkSync", [filePath]);
  }
  function chmodSync(filePath, mode) {
    callSync("chmodSync", [filePath, mode]);
  }
  function chownSync(filePath, uid, gid) {
    callSync("chownSync", [filePath, uid, gid]);
  }
  function symlinkSync(target, linkPath, type) {
    callSync("symlinkSync", [target, linkPath, type]);
  }
  function readlinkSync(filePath) {
    return callSync("readlinkSync", [filePath]);
  }
  function realpathSync(filePath) {
    return callSync("realpathSync", [filePath]);
  }
  function truncateSync(filePath, len) {
    callSync("truncateSync", [filePath, len]);
  }
  function openSync(filePath, flags, mode) {
    return callSync("openSync", [filePath, flags, mode]);
  }
  function readSync(fd, buffer, offset, length, position) {
    const result = callSync("readSync", [fd, length, position]);
    if (buffer && typeof buffer === "object" && "set" in buffer) {
      buffer.set(result.data, offset);
    }
    return result.bytesRead;
  }
  function writeSync(fd, data, position, encoding) {
    return callSync("writeSync", [fd, data, position, encoding]);
  }
  function closeSync(fd) {
    callSync("closeSync", [fd]);
  }
  var promises = {
    readFile: bridgeFs.readFile,
    writeFile: bridgeFs.writeFile,
    stat: bridgeFs.stat,
    lstat: bridgeFs.lstat,
    access: bridgeFs.access,
    readdir: bridgeFs.readdir,
    mkdir: bridgeFs.mkdir,
    rm: bridgeFs.rm,
    rename: bridgeFs.rename,
    copyFile: bridgeFs.copyFile,
    unlink: bridgeFs.unlink,
    appendFile: bridgeFs.appendFile,
    chmod: bridgeFs.chmod,
    chown: bridgeFs.chown,
    symlink: bridgeFs.symlink,
    readlink: bridgeFs.readlink,
    realpath: bridgeFs.realpath,
    truncate: bridgeFs.truncate
  };
  function readFile(filePath, encodingOrCb, callback) {
    const cb = typeof encodingOrCb === "function" ? encodingOrCb : callback;
    const encoding = typeof encodingOrCb === "string" ? encodingOrCb : void 0;
    try {
      const result = readFileSync(filePath, encoding);
      cb(null, result);
    } catch (err) {
      cb(err);
    }
  }
  function writeFile(filePath, data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? void 0 : options;
    try {
      writeFileSync(filePath, data, opts);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  function appendFile(filePath, data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? void 0 : options;
    try {
      appendFileSync(filePath, data, opts);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  function mkdir(dirPath, optionsOrCb, callback) {
    const cb = typeof optionsOrCb === "function" ? optionsOrCb : callback;
    const opts = typeof optionsOrCb === "function" ? void 0 : optionsOrCb;
    try {
      mkdirSync(dirPath, opts);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  function rename(oldPath, newPath, callback) {
    try {
      renameSync(oldPath, newPath);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
  function copyFile(src, dest, callback) {
    try {
      copyFileSync(src, dest);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
  function unlink(filePath, callback) {
    try {
      unlinkSync(filePath);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
  function rm(filePath, options, callback) {
    try {
      rmSync(filePath, options);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
  function chmod(filePath, mode, callback) {
    try {
      chmodSync(filePath, mode);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
  function chown(filePath, uid, gid, callback) {
    try {
      chownSync(filePath, uid, gid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
  function symlink(target, linkPath, typeOrCb, callback) {
    const cb = typeof typeOrCb === "function" ? typeOrCb : callback;
    const type = typeof typeOrCb === "string" ? typeOrCb : void 0;
    try {
      symlinkSync(target, linkPath, type);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  function readlink(filePath, callback) {
    try {
      callback(null, readlinkSync(filePath));
    } catch (err) {
      callback(err);
    }
  }
  function realpath(filePath, callback) {
    try {
      callback(null, realpathSync(filePath));
    } catch (err) {
      callback(err);
    }
  }
  function truncate(filePath, lenOrCb, callback) {
    const cb = typeof lenOrCb === "function" ? lenOrCb : callback;
    const len = typeof lenOrCb === "number" ? lenOrCb : void 0;
    try {
      truncateSync(filePath, len);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  function stat(filePath, callback) {
    try {
      callback(null, statSync(filePath));
    } catch (err) {
      callback(err);
    }
  }
  function lstat(filePath, callback) {
    try {
      callback(null, lstatSync(filePath));
    } catch (err) {
      callback(err);
    }
  }
  function access(filePath, modeOrCb, callback) {
    const cb = typeof modeOrCb === "function" ? modeOrCb : callback;
    const mode = typeof modeOrCb === "number" ? modeOrCb : void 0;
    try {
      accessSync(filePath, mode);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  function createReadStream() {
    throw new Error("[electron-bridge] createReadStream is not supported in browser mode. Use bridgeFs.readFile() instead.");
  }
  function createWriteStream() {
    throw new Error("[electron-bridge] createWriteStream is not supported in browser mode. Use bridgeFs.writeFile() instead.");
  }
  function watch(filePath, optionsOrListener, listener) {
    const opts = typeof optionsOrListener === "function" ? void 0 : optionsOrListener;
    const cb = typeof optionsOrListener === "function" ? optionsOrListener : listener;
    let closeHandle = null;
    let closed = false;
    bridgeFs.watch(filePath, opts, cb).then((handle) => {
      closeHandle = handle.close;
      if (closed) handle.close();
    });
    return {
      close() {
        closed = true;
        closeHandle?.();
      }
    };
  }
  function watchFile() {
    throw new Error("[electron-bridge] fs.watchFile is not supported in browser mode. Use fs.watch() instead.");
  }
  function unwatchFile() {
  }
  var fsModule = {
    constants,
    // Sync
    readFileSync,
    writeFileSync,
    appendFileSync,
    existsSync,
    statSync,
    lstatSync,
    accessSync,
    readdirSync,
    mkdirSync,
    rmdirSync,
    rmSync,
    renameSync,
    copyFileSync,
    unlinkSync,
    chmodSync,
    chownSync,
    symlinkSync,
    readlinkSync,
    realpathSync,
    truncateSync,
    openSync,
    readSync,
    writeSync,
    closeSync,
    // Callback
    readFile,
    writeFile,
    appendFile,
    mkdir,
    rename,
    copyFile,
    unlink,
    rm,
    chmod,
    chown,
    symlink,
    readlink,
    realpath,
    truncate,
    stat,
    lstat,
    access,
    createReadStream,
    createWriteStream,
    watch,
    watchFile,
    unwatchFile,
    // Promises
    promises
  };
  var fs_sync_default = fsModule;

  // src/renderer/index.ts
  ipcRenderer._init();
  globalThis.__bridge_renderer__ = {
    ipcRenderer,
    contextBridge,
    bridgeFs,
    fs: fs_sync_default
  };
  return __toCommonJS(renderer_exports);
})();
//# sourceMappingURL=index.global.js.map