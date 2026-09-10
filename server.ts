import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3100);
const TALLY_URL = process.env.TALLY_URL || 'http://127.0.0.1:9000';

app.use(express.json({ limit: '2mb' }));

const TALLY_EXPORT_TDL_XML = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Voucher Register</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

const tallySales = async (_req: express.Request, res: express.Response) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(TALLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=utf-8' },
      body: TALLY_EXPORT_TDL_XML,
      signal: controller.signal,
    });
    const xml = await response.text();
    if (!response.ok) return res.status(502).json({ ok: false, message: `Tally HTTP ${response.status}`, xml });
    if (!xml.includes('<VOUCHER')) return res.status(502).json({ ok: false, message: 'Tally connected, but no VOUCHER data was returned.', xml });
    return res.json({ ok: true, xml });
  } catch (error: any) {
    return res.status(502).json({ ok: false, message: `Cannot connect to Tally at ${TALLY_URL}: ${error?.message || 'connection failed'}` });
  } finally {
    clearTimeout(timeout);
  }
};

app.get(['/api/health', '/gstr1/api/health'], (_req, res) => {
  res.json({ status: 'ok', service: 'gstr1', tallyUrl: TALLY_URL });
});

app.post(['/api/tally/sales', '/gstr1/api/tally/sales'], tallySales);

const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

// Serve the GSTR1 browser app at both /gstr1 and /gstr1/ without redirects.
// This avoids redirect loops when Cloudflare proxies the /gstr1 path.
app.get(['/gstr1', '/gstr1/'], (_req, res) => res.sendFile(indexPath));
app.get('/gstr1/*', (_req, res) => res.sendFile(indexPath));

// Serve Vite-built assets. Vite is configured with base=/gstr1/.
app.use(express.static(distPath));

// Keep the root fallback for direct Render access.
app.get('*', (_req, res) => res.sendFile(indexPath));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GSTR-1 server running on http://0.0.0.0:${PORT}`);
  console.log(`GSTR-1 public path: /gstr1/`);
  console.log(`Tally source: ${TALLY_URL}`);
});
