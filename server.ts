import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3100);
const TALLY_URL = process.env.TALLY_URL || 'http://127.0.0.1:9000';
const TALLY_BRIDGE_URL = String(process.env.TALLY_BRIDGE_URL || '').replace(/\/$/, '');
const TALLY_BRIDGE_TOKEN = process.env.TALLY_BRIDGE_TOKEN || '';

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
  const timeout = setTimeout(() => controller.abort(), 15000);
  const target = TALLY_BRIDGE_URL ? `${TALLY_BRIDGE_URL}/tally` : TALLY_URL;
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        ...(TALLY_BRIDGE_TOKEN ? { 'X-GSTR1-Bridge-Token': TALLY_BRIDGE_TOKEN } : {}),
      },
      body: TALLY_EXPORT_TDL_XML,
      signal: controller.signal,
    });
    const xml = await response.text();
    if (!response.ok) return res.status(502).json({ ok: false, message: `Tally/bridge HTTP ${response.status}`, xml });
    if (!xml.includes('<VOUCHER')) return res.status(502).json({ ok: false, message: 'Tally connected, but no VOUCHER data was returned.', xml });
    return res.json({ ok: true, xml });
  } catch (error: any) {
    return res.status(502).json({ ok: false, message: `Cannot connect to Tally through ${target}: ${error?.message || 'connection failed'}` });
  } finally {
    clearTimeout(timeout);
  }
};

app.get(['/api/health', '/gstr1/api/health'], (_req, res) => {
  res.json({ status: 'ok', service: 'gstr1', tallyBridge: Boolean(TALLY_BRIDGE_URL) });
});

app.post(['/api/tally/sales', '/gstr1/api/tally/sales'], tallySales);

const distPath = __dirname;
const indexPath = path.join(distPath, 'index.html');

app.use('/gstr1', express.static(distPath, { index: false }));
app.get(['/gstr1', '/gstr1/'], (_req, res) => res.sendFile(indexPath));
app.get('/gstr1/*', (_req, res) => res.sendFile(indexPath));
app.use(express.static(distPath, { index: false }));
app.get('*', (_req, res) => res.sendFile(indexPath));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GSTR-1 server running on http://0.0.0.0:${PORT}`);
  console.log(`GSTR-1 public path: /gstr1/`);
  console.log(`Tally bridge: ${TALLY_BRIDGE_URL || 'direct local Tally URL'}`);
});
