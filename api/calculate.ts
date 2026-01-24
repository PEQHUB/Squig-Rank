import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { 
  IEM, 
  ScoredIEM, 
  CalculationResult, 
  FrequencyCurve,
  PhoneBookBrand 
} from '../src/types';
import { SQUIGLINK_DOMAINS } from '../src/config/domains';
import { alignToR40, normalizeCurve } from '../src/utils/frequencyAlignment';
import { calculateSimilarity } from '../src/utils/correlationCalculator';

// Vercel timeout config (max 10s on hobby, 60s on pro)
export const config = { 
  maxDuration: 10,
};

// Timeouts
const PHONE_BOOK_TIMEOUT = 8000;
const MEASUREMENT_TIMEOUT = 3000;
const MAX_IEMS_PER_DOMAIN = 50; // Limit to avoid timeout

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse price string to number
 */
function parsePrice(priceStr: string | undefined): number | null {
  if (!priceStr || priceStr === '$??' || priceStr === 'Free') return null;
  const cleaned = priceStr.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse frequency response text
 */
function parseFrequencyResponse(text: string): FrequencyCurve {
  const frequencies: number[] = [];
  const db: number[] = [];
  
  for (const line of text.split(/[\r\n]+/)) {
    if (line.startsWith('*') || line.trim() === '') continue;
    
    const parts = line.trim().split(/[\s\t]+/);
    if (parts.length >= 2) {
      const freq = parseFloat(parts[0]);
      const spl = parseFloat(parts[1]);
      
      if (!isNaN(freq) && !isNaN(spl) && freq >= 20 && freq <= 20000) {
        frequencies.push(freq);
        db.push(spl);
      }
    }
  }
  
  return { frequencies, db };
}

/**
 * Parse target curve text
 */
function parseTargetText(text: string): FrequencyCurve {
  const frequencies: number[] = [];
  const db: number[] = [];
  
  for (const line of text.split(/[\r\n]+/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;
    
    const parts = trimmed.split(/[\s\t,]+/);
    if (parts.length >= 2) {
      const freq = parseFloat(parts[0]);
      const dbVal = parseFloat(parts[1]);
      
      if (!isNaN(freq) && !isNaN(dbVal) && freq > 0) {
        frequencies.push(freq);
        db.push(dbVal);
      }
    }
  }
  
  return { frequencies, db };
}

/**
 * Scan a single domain
 */
async function scanDomain(
  domain: string, 
  quality: 'high' | 'low'
): Promise<IEM[]> {
  try {
    const pbResponse = await fetchWithTimeout(
      `https://${domain}/phone_book.json`,
      PHONE_BOOK_TIMEOUT
    );
    
    if (!pbResponse.ok) return [];
    
    const brands: PhoneBookBrand[] = await pbResponse.json();
    const iems: IEM[] = [];
    
    // Flatten phone book
    const phones: Array<{ name: string; file: string; price: number | null }> = [];
    
    for (const brand of brands) {
      for (const phone of brand.phones) {
        const file = Array.isArray(phone.file) ? phone.file[0] : phone.file;
        if (!file) continue;
        
        phones.push({
          name: `${brand.name} ${phone.name}`,
          file,
          price: parsePrice(phone.price),
        });
      }
    }
    
    // Limit phones per domain to avoid timeout
    const limitedPhones = phones.slice(0, MAX_IEMS_PER_DOMAIN);
    
    // Fetch measurements in parallel (limited concurrency)
    const batchSize = 10;
    for (let i = 0; i < limitedPhones.length; i += batchSize) {
      const batch = limitedPhones.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(async (phone) => {
          try {
            const encodedFile = encodeURIComponent(phone.file);
            const url = `https://${domain}/data/${encodedFile}%20L.txt`;
            
            const response = await fetchWithTimeout(url, MEASUREMENT_TIMEOUT);
            if (!response.ok) return null;
            
            const text = await response.text();
            const frequencyData = parseFrequencyResponse(text);
            
            if (frequencyData.frequencies.length < 10) return null;
            
            return {
              id: `${domain}-${phone.file}`.replace(/\s+/g, '-'),
              name: phone.name,
              frequencyData,
              sourceDomain: domain,
              quality,
              price: phone.price,
            } as IEM;
          } catch {
            return null;
          }
        })
      );
      
      for (const iem of results) {
        if (iem) iems.push(iem);
      }
    }
    
    return iems;
  } catch {
    return [];
  }
}

/**
 * Main API handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Get target curves from request body or query
    let target1Text: string | undefined;
    let target2Text: string | undefined;
    
    if (req.method === 'POST' && req.body) {
      target1Text = req.body.target1;
      target2Text = req.body.target2;
    }
    
    // Parse targets
    const targets: Array<{ name: string; curve: FrequencyCurve }> = [];
    
    if (target1Text) {
      targets.push({ name: 'Target 1', curve: parseTargetText(target1Text) });
    }
    if (target2Text) {
      targets.push({ name: 'Target 2', curve: parseTargetText(target2Text) });
    }
    
    // If no targets provided, return error
    if (targets.length === 0) {
      return res.status(400).json({ 
        error: 'No target curves provided. POST with target1 and/or target2 in body.' 
      });
    }
    
    // Scan domains in parallel (limit to high-quality for speed)
    const highQualityDomains = SQUIGLINK_DOMAINS.filter(d => d.quality === 'high');
    
    const domainResults = await Promise.all(
      highQualityDomains.map(d => scanDomain(d.domain, d.quality))
    );
    
    const allIEMs = domainResults.flat();
    
    // Remove duplicates
    const seen = new Set<string>();
    const uniqueIEMs = allIEMs.filter(iem => {
      const key = iem.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    // Calculate similarity for each target
    const results: CalculationResult[] = [];
    
    for (const target of targets) {
      const targetR40 = normalizeCurve(alignToR40(target.curve));
      
      const scoredIEMs: ScoredIEM[] = uniqueIEMs.map(iem => {
        const iemR40 = normalizeCurve(alignToR40(iem.frequencyData));
        const similarity = calculateSimilarity(iemR40, targetR40);
        
        return {
          ...iem,
          similarity,
        };
      });
      
      // Sort by similarity (descending), then by price (ascending) for ties
      scoredIEMs.sort((a, b) => {
        if (Math.abs(b.similarity - a.similarity) > 0.01) {
          return b.similarity - a.similarity;
        }
        return (a.price ?? Infinity) - (b.price ?? Infinity);
      });
      
      results.push({
        targetName: target.name,
        top25: scoredIEMs.slice(0, 25),
      });
    }
    
    return res.status(200).json({
      success: true,
      totalScanned: uniqueIEMs.length,
      results,
    });
    
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
