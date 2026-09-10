import { TallyVoucher, TallyItemEntry } from '../types/gst';

export interface TallyXmlParseResult {
  vouchers: TallyVoucher[];
  companyName?: string;
  companyGstin?: string;
  errors: string[];
}

const text = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
};

const num = (value: string) => {
  const n = Number(String(value || '').replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const xmlUnescape = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const dateToIso = (s: string) => {
  const v = String(s || '').trim();
  if (/^\d{8}$/.test(v)) return `${v.slice(4, 8)}-${v.slice(2, 4)}-${v.slice(0, 2)}`;
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) { const [dd, mm, yyyy] = v.split('-'); return `${yyyy}-${mm}-${dd}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return v;
};

const stateName = (code: string) => ({
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','26':'Dadra and Nagar Haveli and Daman and Diu','27':'Maharashtra','28':'Andhra Pradesh','29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman and Nicobar Islands','36':'Telangana','37':'Andhra Pradesh','38':'Ladakh'
} as Record<string,string>)[code] || '';

function voucherBlocks(xml: string) {
  return [...xml.matchAll(/<VOUCHER\b[^>]*>[\s\S]*?<\/VOUCHER>/gi)].map(m => m[0]);
}

function parseItems(vxml: string, voucherId: string): TallyItemEntry[] {
  const blocks = [...vxml.matchAll(/<ALLINVENTORYENTRIES\.LIST\b[^>]*>[\s\S]*?<\/ALLINVENTORYENTRIES\.LIST>/gi)].map(m => m[0]);
  return blocks.map((b, i) => {
    const itemName = xmlUnescape(text(b, 'STOCKITEMNAME') || text(b, 'STOCKITEM') || text(b, 'ITEMNAME') || `Item ${i + 1}`);
    const quantityRaw = text(b, 'ACTUALQTY') || text(b, 'BILLEDQTY');
    const rateRaw = text(b, 'RATE');
    const amountRaw = text(b, 'AMOUNT');
    const quantity = Math.abs(num(quantityRaw));
    const rate = Math.abs(num(rateRaw)) || (quantity ? Math.abs(num(amountRaw)) / quantity : 0);
    const taxableAmount = Math.abs(num(amountRaw)) || quantity * rate;
    const hsnCode = text(b, 'GSTHSNNAME') || text(b, 'HSN') || text(b, 'HSNCODE') || '';
    const gstRate = num(text(b, 'GSTIGSTRATE') || text(b, 'GSTTAXRATE') || text(b, 'GSTRATE'));
    const igstAmount = Math.abs(num(text(b, 'IGST') || text(b, 'IGSTAMOUNT')));
    const cgstAmount = Math.abs(num(text(b, 'CGST') || text(b, 'CGSTAMOUNT')));
    const sgstAmount = Math.abs(num(text(b, 'SGST') || text(b, 'SGSTAMOUNT')));
    const cessAmount = Math.abs(num(text(b, 'CESS') || text(b, 'CESSAMOUNT')));
    return { id: `${voucherId}-${i + 1}`, itemName, hsnCode, quantity, unit: (quantityRaw.match(/[A-Za-z]+/g) || ['NOS'])[0], rate, taxableAmount, gstRate, igstAmount, cgstAmount, sgstAmount, cessAmount };
  });
}

export function parseTallyXml(xml: string, supplierStateCode = '27'): TallyXmlParseResult {
  const errors: string[] = [];
  const blocks = voucherBlocks(xml);
  const companyGstin = (text(xml, 'GSTREGISTRATIONNUMBER') || text(xml, 'PARTYGSTIN') || '').toUpperCase();
  const companyName = xmlUnescape(text(xml, 'STATENAME') ? (text(xml, 'COMPANYNAME') || text(xml, 'CMPNAME')) : (text(xml, 'COMPANYNAME') || text(xml, 'CMPNAME')));
  const vouchers: TallyVoucher[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const voucherTypeRaw = xmlUnescape(text(b, 'VOUCHERTYPENAME') || 'Sales');
    const voucherType: TallyVoucher['voucherType'] = /credit/i.test(voucherTypeRaw) ? 'Credit Note' : /debit/i.test(voucherTypeRaw) ? 'Debit Note' : /export/i.test(voucherTypeRaw) ? 'Export' : 'Sales';
    const id = text(b, 'MASTERID') || text(b, 'ALTERID') || `${i + 1}`;
    const voucherNo = xmlUnescape(text(b, 'VOUCHERNUMBER') || text(b, 'REFERENCE') || `TALLY-${i + 1}`);
    const date = dateToIso(text(b, 'DATE'));
    const partyName = xmlUnescape(text(b, 'PARTYNAME') || text(b, 'PARTYLEDGERNAME') || text(b, 'LEDGERNAME') || 'Unknown Party');
    const partyGstin = (text(b, 'PARTYGSTIN') || text(b, 'GSTIN') || '').toUpperCase();
    const pos = (partyGstin.slice(0, 2) || text(b, 'PLACEOFSUPPLY').slice(0, 2) || supplierStateCode).padStart(2, '0');
    const totalValue = Math.abs(num(text(b, 'VOUCHERTOTAL') || text(b, 'TOTALVALUE') || text(b, 'AMOUNT')));
    const items = parseItems(b, id);
    const taxableValue = items.length ? items.reduce((s, x) => s + x.taxableAmount, 0) : Math.max(0, totalValue);
    const igst = items.reduce((s, x) => s + x.igstAmount, 0);
    const cgst = items.reduce((s, x) => s + x.cgstAmount, 0);
    const sgst = items.reduce((s, x) => s + x.sgstAmount, 0);
    const cess = items.reduce((s, x) => s + (x.cessAmount || 0), 0);
    const finalTotal = totalValue || taxableValue + igst + cgst + sgst + cess;
    const inter = pos !== supplierStateCode;
    const fixedItems = items.length ? items : [{ id: `${id}-1`, itemName: 'Tally Sales', hsnCode: '', quantity: 1, unit: 'NOS', rate: taxableValue, taxableAmount: taxableValue, gstRate: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, cessAmount: 0 }];
    vouchers.push({ id: `tally-${id}`, voucherType, voucherNo, date, partyName, partyGstin, pos, posName: stateName(pos), isReverseCharge: /yes|y/i.test(text(b, 'ISREVERSECHARGE') || ''), invoiceType: 'Regular', totalValue: finalTotal, taxableValue, igst, cgst, sgst, cess, items: fixedItems, validationMessages: inter ? [] : [] });
  }

  if (!blocks.length) errors.push('Tally XML में कोई VOUCHER block नहीं मिला।');
  return { vouchers, companyName: companyName || undefined, companyGstin: companyGstin || undefined, errors };
}
