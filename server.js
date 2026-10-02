// Petanque scoreboard sync server. No dependencies. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const STATE_FILE = path.join(__dirname, 'state.json');
const PAGE = path.join(__dirname, 'index.html');
const PIN = process.env.ADMIN_PIN || ''; // set ADMIN_PIN to protect the admin screen

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
const clients = new Set();

function broadcast(json) {
  for (const res of clients) res.write(`data: ${json}\n\n`);
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/time') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ now: Date.now(), pin: !!PIN }));
  }

  if (url === '/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(state));
  }

  const pinOk = !PIN || req.headers['x-pin'] === PIN;

  if (url === '/check' && req.method === 'POST') {
    res.writeHead(pinOk ? 204 : 401); return res.end();
  }

  if (url === '/state' && req.method === 'POST') {
    if (!pinOk) { res.writeHead(401); return res.end(); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        state = JSON.parse(body);
        const json = JSON.stringify(state);
        fs.writeFile(STATE_FILE, json, () => {});
        broadcast(json);
        res.writeHead(204); res.end();
      } catch {
        res.writeHead(400); res.end();
      }
    });
    return;
  }

  if (url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(`retry: 1000\n\n`);
    if (state && state.rev) res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clients.delete(res); clearInterval(ping); });
    return;
  }

  if (url === '/' || url === '/admin' || url === '/overlay') {
    fs.readFile(PAGE, (err, data) => {
      if (err) { res.writeHead(500); return res.end('index.html not found next to server.js'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\nPetanque scoreboard running\n');
  console.log(`  Overlay (OBS browser source): http://localhost:${PORT}/overlay`);
  console.log(`  Admin (this computer):        http://localhost:${PORT}/admin`);
  ips.forEach(ip => console.log(`  Admin (phone/tablet on wifi): http://${ip}:${PORT}/admin`));
  console.log('\nPress Ctrl+C to stop.\n');
});
