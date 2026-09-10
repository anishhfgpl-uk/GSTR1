import { INDIAN_STATES } from './indianStates';
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
export function isValidGstin(gstin:string|undefined){ if(!gstin) return false; const c=gstin.trim().toUpperCase(); return c.length===15 && GSTIN_REGEX.test(c) && !!INDIAN_STATES.find(s=>s.code===c.slice(0,2)); }
export function extractStateCodeFromGstin(gstin:string|undefined){ const c=(gstin||'').trim(); return /^\d{2}/.test(c)?c.slice(0,2):null; }
export function formatGstPeriod(month:number,year:number){return `${String(month).padStart(2,'0')}${year}`;}
export function parseGstPeriod(fp:string){const m=Number(fp?.slice(0,2)),y=Number(fp?.slice(2));const months=['January','February','March','April','May','June','July','August','September','October','November','December'];return {month:m,year:y,label:`${months[m-1]||'Month'} ${y}`};}
