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

const TALLY_SALES_XML = `
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
        <VOUCHERTYPENAME TYPE="String">Sales</VOUCHERTYPENAME>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

// This uses Tally's current-company context directly. GSTIN is exposed by
// Tally's CMPGSTaxNumber formula; address/state/phone/email come from the
// Company object for ##SVCurrentCompany.
const TALLY_COMPANY_XML = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>GSTR1 Current Company</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <OBJECT NAME="GSTR1CurrentCompany" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="Yes" ISOPTION="No" ISINTERNAL="No">
            <LOCALFORMULA>CompanyName:##SVCurrentCompany</LOCALFORMULA>
            <LOCALFORMULA>GSTIN:@@CMPGSTaxNumber</LOCALFORMULA>
            <LOCALFORMULA>StateName:$(Company,##SVCurrentCompany).StateName</LOCALFORMULA>
            <LOCALFORMULA>Address1:$(Company,##SVCurrentCompany).Address[1].Address</LOCALFORMULA>
            <LOCALFORMULA>Address2:$(Company,##SVCurrentCompany).Address[2].Address</LOCALFORMULA>
            <LOCALFORMULA>Address3:$(Company,##SVCurrentCompany).Address[3].Address</LOCALFORMULA>
            <LOCALFORMULA>Phone:$(Company,##SVCurrentCompany).PhoneNumber</LOCALFORMULA>
            <LOCALFORMULA>Email:$(Company,##SVCurrentCompany).Email</LOCALFORMULA>
            <LOCALFORMULA>Pincode:$(Company,##SVCurrentCompany).PinCode</LOCALFORMULA>
          </OBJECT>
          <COLLECTION NAME="GSTR1 Current Company" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="Yes" ISOPTION="No" ISINTERNAL="No">
            <OBJECTS>GSTR1CurrentCompany</OBJECTS>
            <NATIVEMETHOD>CompanyName</NATIVEMETHOD>
            <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>StateName</NATIVEMETHOD>
            <NATIVEMETHOD>Address1</NATIVEMETHOD>
            <NATIVEMETHOD>Address2</NATIVEMETHOD>
            <NATIVEMETHOD>Address3</NATIVEMETHOD>
            <NATIVEMETHOD>Phone</NATIVEMETHOD>
            <NATIVEMETHOD>Email</NATIVEMETHOD>
            <NATIVEMETHOD>Pincode</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

async function postToTally(xml: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const target = TALLY_BRIDGE_URL ? `${TALLY_BRIDGE_URL}/tally` : TALLY_URL;
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        ...(TALLY_BRIDGE_TOKEN ? { 'X-GSTR1-Bridge-Token': TALLY_BRIDGE_TOKEN } : {}),
      },
      body: xml,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Tally/bridge HTTP ${response.status}: ${text.slice(0, 500)}`);
    return { text, target };
  } finally {
    clearTimeout(timeout);
  }
}

const tallySales = async (_req: express.Request, res: express.Response) => {
  try {
    const { text: xml } = await postToTally(TALLY_SALES_XML);
    if (!/<VOUCHER\b/i.test(xml)) return res.status(502).json({ ok: false, message: 'Tally connected, but no Sales VOUCHER data was returned.', xml });
    return res.json({ ok: true, xml });
  } catch (error: any) {
    return res.status(502).json({ ok: false, message: `Cannot connect to Tally: ${error?.message || 'connection failed'}` });
  }
};

const tallyCompany = async (_req: express.Request, res: express.Response) => {
  try {
    const { text: xml } = await postToTally(TALLY_COMPANY_XML);
    return res.json({ ok: true, xml });
  } catch (error: any) {
    return res.status(502).json({ ok: false, message: `Cannot fetch current Tally company: ${error?.message || 'connection failed'}` });
  }
};

app.get(['/api/health', '/gstr1/api/health'], (_req, res) => {
  res.json({ status: 'ok', service: 'gstr1', tallyBridge: Boolean(TALLY_BRIDGE_URL) });
});

app.post(['/api/tally/sales', '/gstr1/api/tally/sales'], tallySales);
app.post(['/api/tally/company', '/gstr1/api/tally/company'], tallyCompany);

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
