import { parseTallyCompanyXml, parseTallyXml, TallyCompanyProfile, TallyXmlParseResult } from './tallyXmlParser';

export interface TallyConnectionStatus {
  success: boolean;
  message: string;
  source: 'live_tally_port' | 'failed';
  result?: TallyXmlParseResult;
  company?: TallyCompanyProfile;
}

async function postJson(path: string, body: unknown = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || `Tally proxy returned HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchTallyCompany(): Promise<TallyCompanyProfile> {
  const payload = await postJson('/api/tally/company');
  const xml = String(payload?.xml || '');
  if (!xml) throw new Error('Tally company profile response खाली है।');
  return parseTallyCompanyXml(xml);
}

export async function autoFetchFromTally(
  _tallyHost: string = 'http://localhost:9000',
  supplierStateCode: string = '27',
): Promise<TallyConnectionStatus> {
  try {
    // Both calls go through the GSTR1 server proxy. The proxy/bridge talks to
    // 127.0.0.1:9000, so the data comes from the TallyPrime instance currently
    // running on the user's PC rather than from sample/uploaded data.
    const [company, salesPayload] = await Promise.all([
      fetchTallyCompany().catch(() => undefined),
      postJson('/api/tally/sales', { supplierStateCode }),
    ]);
    const xmlText = String(salesPayload?.xml || '');
    if (!/<VOUCHER\b/i.test(xmlText)) throw new Error('Tally ने कोई Sales VOUCHER data return नहीं किया।');
    const parsed = parseTallyXml(xmlText, company?.gstin?.slice(0, 2) || supplierStateCode);
    if (!parsed.vouchers.length) throw new Error(parsed.errors[0] || 'Tally से कोई Sales voucher नहीं मिला।');
    if (company) {
      parsed.companyProfile = company;
      parsed.companyName = company.name || parsed.companyName;
      parsed.companyGstin = company.gstin || parsed.companyGstin;
    }
    return {
      success: true,
      source: 'live_tally_port',
      message: `Live TallyPrime की currently-open company से ${parsed.vouchers.length} Sales vouchers और company profile import हुआ।`,
      result: parsed,
      company,
    };
  } catch (err: any) {
    return {
      success: false,
      source: 'failed',
      message: `Tally से data नहीं मिला: ${err?.message || 'Connection failed'}. TallyPrime चालू रखें और port 9000 check करें।`,
    };
  }
}
