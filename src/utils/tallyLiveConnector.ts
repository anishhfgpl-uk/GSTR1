import { parseTallyXml, TallyXmlParseResult } from './tallyXmlParser';

export interface TallyConnectionStatus {
  success: boolean;
  message: string;
  source: 'live_tally_port' | 'auto_embedded_tally' | 'failed';
  result?: TallyXmlParseResult;
}

export async function autoFetchFromTally(
  _tallyHost: string = 'http://localhost:9000',
  supplierStateCode: string = '27',
): Promise<TallyConnectionStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('/api/tally/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierStateCode }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || `Tally proxy returned HTTP ${response.status}`);
    const xmlText = String(payload?.xml || '');
    if (!xmlText.includes('<VOUCHER')) throw new Error('Tally ने कोई VOUCHER data return नहीं किया।');
    const parsed = parseTallyXml(xmlText, supplierStateCode);
    if (!parsed.vouchers.length) throw new Error(parsed.errors[0] || 'Tally से कोई Sales voucher नहीं मिला।');
    return { success: true, source: 'live_tally_port', message: `Live Tally Prime से ${parsed.vouchers.length} vouchers सफलतापूर्वक pick किए गए।`, result: parsed };
  } catch (err: any) {
    return { success: false, source: 'failed', message: `Tally से data नहीं मिला: ${err?.message || 'Connection failed'}. Tally Prime चालू रखें और port 9000 check करें।` };
  }
}
