// ================================================================ 
// v7.24 FIX-V724-2 — utils/sanitize.ts CANONICAL IMPLEMENTATION 
// Strips HTML tags and ASCII control characters from all free-text 
// service-layer string inputs before DB persistence (FIX-VSEC-7). 
// Called by: createFirm(), updateFirm(), updateSettings() 
// ================================================================ 

import { ERR } from '../constants/errorCodes'; 

export function sanitizeText(input: string): string { 
  if (typeof input !== 'string') throw new Error(ERR.INVALID_TEXT_CONTENT + ': input must be a string'); 
  
  const stripped = input 
    .replace(/<[^>]*>/g, '') // strip HTML tags 
    .replace(/[\x00-\x1F\x7F]/g, '') // strip ASCII control characters 
    .trim(); 
    
  if (stripped.length === 0 && input.trim().length > 0) { 
    throw new Error(ERR.INVALID_TEXT_CONTENT + ': input reduced to empty after sanitization'); 
  } 
  
  return stripped; 
}