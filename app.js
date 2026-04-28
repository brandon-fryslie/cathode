// app.js — the mini Electron-style app that runs in the demo iframe.
// This is the "user code" — what an Electron app's renderer would write.
// It uses cathode's globals exactly as a real preloaded renderer would.

const renderer = window.__bridge_renderer__;
if (!renderer) {
  document.body.innerHTML = '<p style="color:#f55;padding:24px">cathode renderer failed to load.</p>';
  throw new Error('cathode renderer not present');
}
const { ipcRenderer, bridgeFs } = renderer;

// ----- Output panel ----------------------------------------------------------

const output = document.getElementById('output');

function logBlock(label, payload, kind = 'info') {
  const block = document.createElement('div');
  block.className = `out-block out-${kind}`;
  const head = document.createElement('div');
  head.className = 'out-head';
  head.textContent = label;
  const body = document.createElement('pre');
  body.className = 'out-body';
  body.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  block.appendChild(head);
  block.appendChild(body);
  output.prepend(block);
  while (output.children.length > 12) output.removeChild(output.lastChild);
}

function logErr(label, err) {
  logBlock(label, err && err.message ? err.message : String(err), 'err');
}

// ----- Buttons ---------------------------------------------------------------

const FILES = [
  '/Users/demo/Documents/notes.md',
  '/Users/demo/Documents/budget.csv',
  '/Users/demo/Documents/README.txt',
];

document.getElementById('btn-open').addEventListener('click', async () => {
  // Cycle through the demo files; in a real app this would be dialog.showOpenDialog.
  const idx = Number(document.getElementById('btn-open').dataset.idx || '0');
  const path = FILES[idx % FILES.length];
  document.getElementById('btn-open').dataset.idx = String(idx + 1);
  try {
    const contents = await bridgeFs.readFile(path);
    logBlock(`bridgeFs.readFile(${path})`, contents, 'ok');
  } catch (err) {
    logErr(`readFile(${path}) failed`, err);
  }
});

document.getElementById('btn-stat').addEventListener('click', async () => {
  const path = '/Users/demo/Documents/notes.md';
  try {
    const stats = await bridgeFs.stat(path);
    logBlock(`bridgeFs.stat(${path})`, stats, 'ok');
  } catch (err) {
    logErr('stat failed', err);
  }
});

document.getElementById('btn-list').addEventListener('click', async () => {
  try {
    const entries = await bridgeFs.readdir('/Users/demo/Documents');
    logBlock('bridgeFs.readdir(/Users/demo/Documents)', entries, 'ok');
  } catch (err) {
    logErr('readdir failed', err);
  }
});

document.getElementById('btn-save').addEventListener('click', async () => {
  const path = '/Users/demo/Documents/notes.md';
  const stamp = new Date().toLocaleTimeString();
  const newContents = `# Project notes\n\n- last touched ${stamp} from the cathode demo\n`;
  try {
    await bridgeFs.writeFile(path, newContents);
    logBlock(`bridgeFs.writeFile(${path})`, `wrote ${newContents.length} bytes`, 'ok');
  } catch (err) {
    logErr('writeFile failed', err);
  }
});

document.getElementById('btn-task').addEventListener('click', async () => {
  try {
    const result = await ipcRenderer.invoke('app:run-task', 'rebuild-index');
    logBlock(`ipcRenderer.invoke('app:run-task')`, result, 'ok');
  } catch (err) {
    logErr('run-task failed', err);
  }
});

document.getElementById('btn-notify').addEventListener('click', () => {
  ipcRenderer.send('app:show-notification', 'cathode demo', 'Notification dispatched via ipcRenderer.send');
  logBlock(`ipcRenderer.send('app:show-notification')`, 'fire-and-forget', 'ok');
});

document.getElementById('btn-tick').addEventListener('click', () => {
  // Trigger the simulated main process to push an ipc:message back.
  window.__cathodeDemo.pushTick();
});

// ipcRenderer.on — listen to server-pushed events.
ipcRenderer.on('app:tick', (_event, payload) => {
  logBlock(`ipcRenderer.on('app:tick') fired`, payload, 'evt');
});
ipcRenderer.on('app:notification-shown', (_event, payload) => {
  showToast(payload.title, payload.body);
  logBlock(`ipcRenderer.on('app:notification-shown')`, payload, 'evt');
});

// ----- Toast / notification UI ----------------------------------------------

function showToast(title, body) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<strong></strong><span></span>`;
  toast.querySelector('strong').textContent = title;
  toast.querySelector('span').textContent = body;
  document.getElementById('toasts').appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ----- Traffic panel ---------------------------------------------------------

const traffic = document.getElementById('traffic');
const trafficCount = document.getElementById('traffic-count');
let count = 0;

window.__cathodeDemo.onTraffic((direction, payload) => {
  count++;
  trafficCount.textContent = String(count);
  const row = document.createElement('div');
  row.className = `tr tr-${direction}`;
  const arrow = direction === 'in' ? '↑' : '↓';
  const labelText = direction === 'in' ? 'renderer → main' : 'main → renderer';
  const summary = summarize(payload);
  row.innerHTML = `
    <div class="tr-head">
      <span class="tr-arrow">${arrow}</span>
      <span class="tr-label">${labelText}</span>
      <span class="tr-summary"></span>
    </div>
    <pre class="tr-body"></pre>
  `;
  row.querySelector('.tr-summary').textContent = summary;
  row.querySelector('.tr-body').textContent = JSON.stringify(payload, null, 2);
  row.querySelector('.tr-head').addEventListener('click', () => row.classList.toggle('open'));
  traffic.prepend(row);
  while (traffic.children.length > 40) traffic.removeChild(traffic.lastChild);
});

function summarize(msg) {
  if (msg.type === 'ipc:invoke') return `ipc:invoke ${msg.channel}`;
  if (msg.type === 'ipc:invoke:result') return `ipc:invoke:result#${msg.id}${msg.error ? ' [error]' : ''}`;
  if (msg.type === 'ipc:send') return `ipc:send ${msg.channel}`;
  if (msg.type === 'ipc:message') return `ipc:message ${msg.channel}`;
  if (msg.type === 'client:ready') return `client:ready`;
  return msg.type || 'unknown';
}

// ----- Welcome line ----------------------------------------------------------
logBlock('demo ready', 'Click any button. Each click flows through real cathode renderer code, becomes a JSON message on the right, and is answered by a simulated main process.', 'info');
