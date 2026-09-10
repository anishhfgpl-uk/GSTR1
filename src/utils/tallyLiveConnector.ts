import { parseTallyXml, TallyXmlParseResult } from './tallyXmlParser';

export interface TallyConnectionStatus {
  success: boolean;
  message: string;
  source: 'live_tally_port' | 'auto_embedded_tally' | 'failed';
  result?: TallyXmlParseResult;
}

async function postTally(xml: string): Promise<string> {
  // Same-origin HTTPS path. Cloudflare Tunnel can forward /gstr1-tally to
  // the local TallyPrime HTTP server on 127.0.0.1:9000. This avoids browser
  // mixed-content restrictions and, importantly, talks to the user's
  // currently-open Tally company rather than a fixed company.
  const response = await fetch('/gstr1-tally', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=utf-8' },
    body: xml,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tally bridge HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text;
}

function salesRequest(): string {
  return `
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
}

export async function autoFetchFromTally(
  _tallyHost: string = 'http://localhost:9000',
  supplierStateCode: string = '27',
): Promise<TallyConnectionStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const xmlText = await postTally(salesRequest());
      if (!xmlText.includes('<VOUCHER')) throw new Error('Tally ने कोई VOUCHER data return नहीं किया।');
      const parsed = parseTallyXml(xmlText, supplierStateCode);
      if (!parsed.vouchers.length) throw new Error(parsed.errors[0] || 'Tally से कोई Sales voucher नहीं मिला।');
      return {
        success: true,
        source: 'live_tally_port',
        message: `Live Tally Prime की currently-open company से ${parsed.vouchers.length} Sales vouchers pick किए गए।`,
        result: parsed,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: any) {
    return {
      success: false,
      source: 'failed',
      message: `Tally से data नहीं मिला: ${err?.message || 'Connection failed'}. TallyPrime चालू रखें और port 9000 check करें।`,
    };
  }
}
