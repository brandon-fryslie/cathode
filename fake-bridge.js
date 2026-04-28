// fake-bridge.js — replaces window.WebSocket with an in-page stub that routes
// cathode renderer messages to a simulated Node main process.
//
// IMPORTANT: this file must load BEFORE cathode-renderer.js. cathode's
// renderer-side bundle calls `new WebSocket(...)` at import time, and that
// constructor MUST already be the fake one for the rest of the demo to work.
//
// Real cathode source is the renderer half. The simulated main process below
// is a hand-written stub — there's no Node.js runtime in your browser tab,
// so that side has to be faked. The protocol it speaks is the real one
// (see https://github.com/brandon-fryslie/cathode/blob/master/src/shared/protocol.ts).

(function () {
  const TRAFFIC_LISTENERS = new Set();

  function publish(direction, payload) {
    for (const fn of TRAFFIC_LISTENERS) fn(direction, payload);
  }

  // ----- Simulated main process ------------------------------------------------
  // Every handler receives the parsed ipc:invoke / ipc:send args and either
  // returns a value (resolved as ipc:invoke:result) or throws (rejected).
  // Async handlers are awaited; sync ones are wrapped automatically.

  const FAKE_FS = {
    '/Users/demo/Documents': {
      type: 'dir',
      entries: ['notes.md', 'budget.csv', 'photos', 'README.txt'],
    },
    '/Users/demo/Documents/notes.md': {
      type: 'file',
      content: '# Project notes\n\n- ship cathode demo\n- verify WS protocol fidelity\n- write up "renderer is real, main is faked"\n',
      mtime: 1714521600000,
    },
    '/Users/demo/Documents/budget.csv': {
      type: 'file',
      content: 'item,cost\nGPU,1499\nlaptop,2299\ncoffee,4.50\n',
      mtime: 1714435200000,
    },
    '/Users/demo/Documents/README.txt': {
      type: 'file',
      content: 'This filesystem is fake.\nThe protocol carrying the requests is real.\n',
      mtime: 1714694400000,
    },
    '/Users/demo/Documents/photos': {
      type: 'dir',
      entries: ['vacation.jpg', 'screenshot.png'],
    },
  };

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  const ipcInvokeHandlers = {
    // Application-level RPC channels
    async 'app:run-task'(taskName) {
      await delay(120 + Math.random() * 80);
      const startedAt = new Date().toISOString();
      return {
        taskName,
        startedAt,
        runtimeMs: Math.round(80 + Math.random() * 120),
        result: 'ok',
      };
    },

    async 'app:save-file'(path, contents) {
      await delay(60);
      const bytes = new TextEncoder().encode(String(contents)).length;
      return { path, bytes, savedAt: new Date().toISOString() };
    },

    // bridgeFs channels — these are the channel names cathode's bridgeFs
    // module sends. See src/renderer/bridge-fs.ts.
    async 'bridge:fs:readFile'(path, _encoding) {
      await delay(40);
      const node = FAKE_FS[path];
      if (!node) throw new Error(JSON.stringify({ message: `ENOENT: no such file '${path}'`, code: 'ENOENT', path }));
      if (node.type !== 'file') throw new Error(JSON.stringify({ message: `EISDIR: ${path}`, code: 'EISDIR', path }));
      return node.content;
    },

    async 'bridge:fs:readdir'(path, _options) {
      await delay(50);
      const node = FAKE_FS[path];
      if (!node) throw new Error(JSON.stringify({ message: `ENOENT: ${path}`, code: 'ENOENT', path }));
      if (node.type !== 'dir') throw new Error(JSON.stringify({ message: `ENOTDIR: ${path}`, code: 'ENOTDIR', path }));
      return node.entries;
    },

    async 'bridge:fs:stat'(path) {
      await delay(35);
      const node = FAKE_FS[path];
      if (!node) throw new Error(JSON.stringify({ message: `ENOENT: ${path}`, code: 'ENOENT', path }));
      const isFile = node.type === 'file';
      return {
        size: isFile ? new TextEncoder().encode(node.content).length : 0,
        mtimeMs: node.mtime ?? Date.now(),
        ctimeMs: node.mtime ?? Date.now(),
        atimeMs: node.mtime ?? Date.now(),
        birthtimeMs: node.mtime ?? Date.now(),
        mode: isFile ? 0o100644 : 0o040755,
        isFile,
        isDirectory: !isFile,
        isSymbolicLink: false,
      };
    },

    async 'bridge:fs:writeFile'(path, data, _options) {
      await delay(60);
      FAKE_FS[path] = { type: 'file', content: String(data), mtime: Date.now() };
      return undefined;
    },
  };

  const ipcSendHandlers = {
    'app:show-notification'(title, body) {
      // ipcRenderer.send is fire-and-forget; we just observe it.
      // We also push back an ipc:message to acknowledge — that exercises the
      // server-to-client direction of the protocol.
      const id = Math.floor(Math.random() * 1e6);
      sendToClient({
        type: 'ipc:message',
        channel: 'app:notification-shown',
        args: [{ id, title, body, shownAt: new Date().toISOString() }],
      });
    },

    'app:log'(level, message) {
      // Pure observation — nothing comes back.
      void level; void message;
    },
  };

  // The "client" here is the cathode renderer reachable via the FakeWebSocket
  // instance. We only ever have one in this demo.
  let openSocket = null;

  function sendToClient(msg) {
    if (!openSocket) return;
    publish('out', msg);
    openSocket._deliver(JSON.stringify(msg));
  }

  async function handleClientMessage(socket, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    publish('in', msg);

    if (msg.type === 'ipc:send') {
      const fn = ipcSendHandlers[msg.channel];
      if (fn) fn(...msg.args);
      return;
    }

    if (msg.type === 'ipc:invoke') {
      const fn = ipcInvokeHandlers[msg.channel];
      let response;
      if (!fn) {
        response = { type: 'ipc:invoke:result', id: msg.id, error: `No main-process handler for channel '${msg.channel}'` };
      } else {
        try {
          const result = await fn(...msg.args);
          response = { type: 'ipc:invoke:result', id: msg.id, result };
        } catch (err) {
          response = { type: 'ipc:invoke:result', id: msg.id, error: err && err.message ? err.message : String(err) };
        }
      }
      publish('out', response);
      socket._deliver(JSON.stringify(response));
      return;
    }

    if (msg.type === 'client:ready') {
      // No-op; the real server uses this for window-tracking.
      return;
    }
  }

  // ----- Fake WebSocket --------------------------------------------------------

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;

      // Connect on next tick so listeners can attach first (matches real WS timing).
      setTimeout(() => {
        this.readyState = FakeWebSocket.OPEN;
        openSocket = this;
        this.onopen && this.onopen({ type: 'open' });
      }, 10);
    }

    send(data) {
      if (this.readyState !== FakeWebSocket.OPEN) {
        throw new Error('FakeWebSocket: send before open');
      }
      // Schedule asynchronously to mimic real network ordering.
      setTimeout(() => handleClientMessage(this, data), 0);
    }

    close() {
      if (this.readyState === FakeWebSocket.CLOSED) return;
      this.readyState = FakeWebSocket.CLOSED;
      if (openSocket === this) openSocket = null;
      this.onclose && this.onclose({ type: 'close' });
    }

    _deliver(data) {
      this.onmessage && this.onmessage({ type: 'message', data });
    }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSING = 2;
  FakeWebSocket.CLOSED = 3;

  window.WebSocket = FakeWebSocket;

  // Public API for the demo UI
  window.__cathodeDemo = {
    onTraffic(fn) { TRAFFIC_LISTENERS.add(fn); return () => TRAFFIC_LISTENERS.delete(fn); },
    pushTick() {
      // Lets the demo emit a server-pushed event on demand, exercising
      // ipcRenderer.on / 'ipc:message'.
      sendToClient({
        type: 'ipc:message',
        channel: 'app:tick',
        args: [{ at: new Date().toISOString(), value: Math.round(Math.random() * 1000) }],
      });
    },
  };
})();
