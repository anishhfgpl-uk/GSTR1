import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, Eye, RotateCcw, HelpCircle } from 'lucide-react';
import { TallyVoucher, BusinessConfig } from './types/gst';
import { DEFAULT_BUSINESS_CONFIG, SAMPLE_TALLY_VOUCHERS } from './utils/sampleData';
import { generateGstr1, exportGstr1ToExcel } from './utils/gstr1Generator';
import { autoFetchFromTally } from './utils/tallyLiveConnector';
import { Navbar } from './components/Navbar';
import { Gstr1SummaryCards } from './components/Gstr1SummaryCards';
import { TableTabs, TabId } from './components/TableTabs';
import { AllVouchersTable } from './components/AllVouchersTable';
import { B2BTable } from './components/B2BTable';
import { B2CLTable } from './components/B2CLTable';
import { B2CSTable } from './components/B2CSTable';
import { CdnrTable } from './components/CdnrTable';
import { HsnTable } from './components/HsnTable';
import { DocsTable } from './components/DocsTable';
import { ValidationWarnings } from './components/ValidationWarnings';
import { TallyImportModal } from './components/TallyImportModal';
import { BusinessConfigModal } from './components/BusinessConfigModal';
import { InvoiceEditModal } from './components/InvoiceEditModal';
import { Gstr1JsonPreviewModal } from './components/Gstr1JsonPreviewModal';
import { HelpGuideModal } from './components/HelpGuideModal';
import { extractStateCodeFromGstin } from './utils/gstinValidator';

export default function App() {
  const [config, setConfig] = useState<BusinessConfig>(() => { try { return JSON.parse(localStorage.getItem('gstr1_business_config') || 'null') || DEFAULT_BUSINESS_CONFIG; } catch { return DEFAULT_BUSINESS_CONFIG; } });
  const [vouchers, setVouchers] = useState<TallyVoucher[]>(() => { try { return JSON.parse(localStorage.getItem('gstr1_vouchers') || 'null') || SAMPLE_TALLY_VOUCHERS; } catch { return SAMPLE_TALLY_VOUCHERS; } });
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isJsonPreviewOpen, setIsJsonPreviewOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [voucherToEdit, setVoucherToEdit] = useState<TallyVoucher | null>(null);
  const [isSyncingTally, setIsSyncingTally] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>('Tally se live data connect ho raha hai...');

  useEffect(() => { localStorage.setItem('gstr1_business_config', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('gstr1_vouchers', JSON.stringify(vouchers)); }, [vouchers]);

  const filteredVouchers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return vouchers;
    return vouchers.filter(v => v.voucherNo.toLowerCase().includes(q) || v.partyName.toLowerCase().includes(q) || (v.partyGstin || '').toLowerCase().includes(q) || (v.posName || '').toLowerCase().includes(q) || v.items.some(it => it.itemName.toLowerCase().includes(q) || it.hsnCode.toLowerCase().includes(q)));
  }, [vouchers, searchTerm]);
  const gstr1Data = useMemo(() => generateGstr1(vouchers, config), [vouchers, config]);

  const handleImportVouchers = (imported: TallyVoucher[], detectedCompany?: { name?: string; gstin?: string }) => {
    setVouchers(imported);
    if (detectedCompany) setConfig(prev => ({ ...prev, ...(detectedCompany.name ? { tradeName: detectedCompany.name } : {}), ...(detectedCompany.gstin ? { supplierGstin: detectedCompany.gstin, stateCode: extractStateCodeFromGstin(detectedCompany.gstin) || prev.stateCode } : {}) }));
  };

  const handleAutoSyncTally = async () => {
    setIsSyncingTally(true);
    setSyncNotice('Tally Prime se live Sales data pick ho raha hai...');
    try {
      const result = await autoFetchFromTally('http://localhost:9000', config.stateCode);
      if (result.result?.vouchers.length) {
        setVouchers(result.result.vouchers);
        if (result.result.companyName || result.result.companyGstin) setConfig(prev => ({ ...prev, ...(result.result?.companyName ? { tradeName: result.result.companyName } : {}), ...(result.result?.companyGstin ? { supplierGstin: result.result.companyGstin, stateCode: extractStateCodeFromGstin(result.result.companyGstin) || prev.stateCode } : {}) }));
      }
      setSyncNotice(result.message);
    } catch (e: any) { setSyncNotice(`Tally connection failed: ${e?.message || 'Port 9000 check karein.'}`); }
    finally { setIsSyncingTally(false); }
  };

  useEffect(() => { handleAutoSyncTally(); }, []);

  const handleSaveVoucher = (saved: TallyVoucher) => setVouchers(prev => { const i = prev.findIndex(v => v.id === saved.id); if (i >= 0) { const copy = [...prev]; copy[i] = saved; return copy; } return [saved, ...prev]; });
  const handleDeleteVoucher = (id: string) => { if (window.confirm('Delete this voucher?')) setVouchers(prev => prev.filter(v => v.id !== id)); };
  const handleOpenEdit = (v: TallyVoucher) => { setVoucherToEdit(v); setIsEditModalOpen(true); };
  const handleOpenAdd = () => { setVoucherToEdit(null); setIsEditModalOpen(true); };
  const handleFixTaxHead = (id: string) => setVouchers(prev => prev.map(v => { if (v.id !== id) return v; const inter = v.pos !== config.stateCode; const items = v.items.map(it => { const tax = it.taxableAmount * it.gstRate / 100; return { ...it, igstAmount: inter ? tax : 0, cgstAmount: inter ? 0 : tax / 2, sgstAmount: inter ? 0 : tax / 2 }; }); return { ...v, items, igst: items.reduce((a,b)=>a+b.igstAmount,0), cgst: items.reduce((a,b)=>a+b.cgstAmount,0), sgst: items.reduce((a,b)=>a+b.sgstAmount,0), hasTaxMismatch: false, validationMessages: (v.validationMessages || []).filter(m => !m.includes('Inter-state') && !m.includes('Intra-state')) }; }));
  const handleFixAllTaxHeads = () => setVouchers(prev => prev.map(v => { if (!v.hasTaxMismatch) return v; const inter=v.pos!==config.stateCode; const items=v.items.map(it=>{const tax=it.taxableAmount*it.gstRate/100;return {...it,igstAmount:inter?tax:0,cgstAmount:inter?0:tax/2,sgstAmount:inter?0:tax/2};}); return {...v,items,igst:items.reduce((a,b)=>a+b.igstAmount,0),cgst:items.reduce((a,b)=>a+b.cgstAmount,0),sgst:items.reduce((a,b)=>a+b.sgstAmount,0),hasTaxMismatch:false}; }));
  const handleDownloadJson = () => { const blob = new Blob([JSON.stringify(gstr1Data.gstr1Json, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`GSTR1_${config.supplierGstin}_${config.returnPeriod}.json`; a.click(); URL.revokeObjectURL(url); };
  const handleResetSampleData = () => { setVouchers(SAMPLE_TALLY_VOUCHERS); setConfig(DEFAULT_BUSINESS_CONFIG); };
  const handleClearAllVouchers = () => { if (window.confirm('Are you sure you want to clear all vouchers?')) setVouchers([]); };

  return <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans flex flex-col">
    <Navbar config={config} totalVouchers={vouchers.length} hasErrors={gstr1Data.summary.warningCount>0} isSyncingTally={isSyncingTally} onAutoSyncTally={handleAutoSyncTally} onOpenImport={()=>setIsImportModalOpen(true)} onOpenConfig={()=>setIsConfigModalOpen(true)} onOpenGuide={()=>setIsGuideOpen(true)} onOpenAddInvoice={handleOpenAdd} onDownloadJson={handleDownloadJson} onExportExcel={()=>exportGstr1ToExcel(vouchers,config,gstr1Data)} onPreviewJson={()=>setIsJsonPreviewOpen(true)} />
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {syncNotice && <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-emerald-900">{syncNotice}</span><button onClick={handleAutoSyncTally} disabled={isSyncingTally} className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">⚡ Re-Sync Tally</button></div>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><div className="flex items-center gap-3"><div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg"><Sparkles className="w-5 h-5"/></div><div><h1 className="text-sm font-bold">GSTR-1 Outward Supplies Dashboard</h1><p className="text-xs text-slate-600">FY {config.financialYear} | Return Period: {config.returnPeriod} | GSTIN: {config.supplierGstin}</p></div></div><div className="flex items-center gap-2"><button onClick={()=>setIsJsonPreviewOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 rounded-lg"><Eye className="w-3.5 h-3.5"/>Preview JSON</button><button onClick={handleResetSampleData} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 rounded-lg"><RotateCcw className="w-3.5 h-3.5"/>Sample Data</button>{vouchers.length>0&&<button onClick={handleClearAllVouchers} className="px-2.5 py-1.5 text-xs text-rose-600 rounded-lg">Clear</button>}</div></div>
      <Gstr1SummaryCards summary={gstr1Data.summary} onSelectTab={t=>setActiveTab(t as TabId)}/>
      <TableTabs activeTab={activeTab} onSelectTab={setActiveTab} summary={gstr1Data.summary} searchTerm={searchTerm} onSearchChange={setSearchTerm}/>
      {activeTab==='all'&&<AllVouchersTable vouchers={filteredVouchers} onEdit={handleOpenEdit} onDelete={handleDeleteVoucher}/>} {activeTab==='b2b'&&<B2BTable groups={gstr1Data.b2bGroups}/>} {activeTab==='b2cl'&&<B2CLTable groups={gstr1Data.b2clGroups}/>} {activeTab==='b2cs'&&<B2CSTable items={gstr1Data.b2csItems}/>} {activeTab==='cdnr'&&<CdnrTable groups={gstr1Data.cdnrGroups}/>} {activeTab==='hsn'&&<HsnTable items={gstr1Data.hsnItems}/>} {activeTab==='docs'&&<DocsTable docDet={gstr1Data.docDet}/>} {activeTab==='warnings'&&<ValidationWarnings vouchers={filteredVouchers} onFixTaxHead={handleFixTaxHead} onFixAllTaxHeads={handleFixAllTaxHeads} onEditVoucher={handleOpenEdit}/>} 
    </main>
    <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-center text-xs text-slate-500"><div className="max-w-7xl mx-auto px-4 flex justify-between"><span className="font-bold text-slate-800">Tally to GSTR-1 Generator</span><div className="flex gap-4"><button onClick={()=>setIsGuideOpen(true)} className="text-emerald-700 flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5"/>Help</button><button onClick={()=>setIsConfigModalOpen(true)}>Change GSTIN / Period</button></div></div></footer>
    <TallyImportModal isOpen={isImportModalOpen} onClose={()=>setIsImportModalOpen(false)} onImportVouchers={handleImportVouchers} config={config}/>
    <BusinessConfigModal isOpen={isConfigModalOpen} onClose={()=>setIsConfigModalOpen(false)} config={config} onSave={setConfig}/>
    <InvoiceEditModal isOpen={isEditModalOpen} onClose={()=>{setIsEditModalOpen(false);setVoucherToEdit(null)}} voucherToEdit={voucherToEdit} config={config} onSave={handleSaveVoucher}/>
    <Gstr1JsonPreviewModal isOpen={isJsonPreviewOpen} onClose={()=>setIsJsonPreviewOpen(false)} gstr1Json={gstr1Data.gstr1Json} onDownload={handleDownloadJson}/>
    <HelpGuideModal isOpen={isGuideOpen} onClose={()=>setIsGuideOpen(false)}/>
  </div>;
}
