import http from 'node:http';

const PORT = Number(process.env.BRIDGE_PORT || 9100);
const TALLY_URL = process.env.TALLY_URL || 'http://127.0.0.1:9000';
const TOKEN = process.env.GSTR1_BRIDGE_TOKEN || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://anish-tech.online';

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, {
    'Content-Type': `${contentType}; charset=utf-8`,
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-GSTR1-Bridge-Token',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function authorized(req) {
  if (!TOKEN) return true;
  return req.headers['x-gstr1-bridge-token'] === TOKEN;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (req.url === '/health' && req.method === 'GET') {
    return send(res, 200, JSON.stringify({ ok: true, service: 'gstr1-tally-bridge', tally: TALLY_URL }));
  }

  if (req.url === '/tally' && req.method === 'POST') {
    if (!authorized(req)) return send(res, 401, JSON.stringify({ ok: false, message: 'Invalid bridge token' }));

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const xml = Buffer.concat(chunks).toString('utf8');
    if (!xml.trim()) return send(res, 400, JSON.stringify({ ok: false, message: 'Missing Tally XML request' }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(TALLY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml;charset=utf-8' },
        body: xml,
        signal: controller.signal,
      });
      const text = await response.text();
      return send(res, response.ok ? 200 : 502, text, 'text/xml');
    } catch (error) {
      return send(res, 502, JSON.stringify({ ok: false, message: `Cannot connect to TallyPrime at ${TALLY_URL}: ${error?.message || 'connection failed'}` }));
    } finally {
      clearTimeout(timeout);
    }
  }

  return send(res, 404, JSON.stringify({ ok: false, message: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`GSTR1 Tally Bridge running on http://127.0.0.1:${PORT}`);
  console.log(`TallyPrime target: ${TALLY_URL}`);
  console.log(`Allowed web origin: ${ALLOWED_ORIGIN}`);
  console.log(`Bridge token protection: ${TOKEN ? 'ON' : 'OFF (set GSTR1_BRIDGE_TOKEN)'}`);
});
