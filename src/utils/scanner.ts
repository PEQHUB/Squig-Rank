import { SQUIGLINK_DOMAINS, type DomainConfig } from '../config/domains';
import { classifyItem } from './itemClassifier';
import type { 
  IEM, 
  PhoneBookBrand, 
  PhoneBookPhone, 
  ParsedPhone,
  FrequencyCurve,
  ErrorEntry 
} from '../types';

// Configurable timeouts
const PHONE_BOOK_TIMEOUT = 10000;  // 10s for phone_book.json
const MEASUREMENT_TIMEOUT = 5000;  // 5s per measurement file
const MAX_CONCURRENT_MEASUREMENTS = 5;  // Limit concurrent fetches per domain

// Error collection for logging
let errorLog: ErrorEntry[] = [];

// Paths to probe for standard Squiglink domains
const PROBE_PATHS = ["", "iems", "headphones", "earbuds", "5128", "headphones/5128"];

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string, 
  timeoutMs: number,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse price string to number (e.g. "$1,200" -> 1200)
 */
function parsePrice(priceStr: string | undefined): number | null {
  if (!priceStr || priceStr === '$??' || priceStr === 'Free') return null;
  const cleaned = priceStr.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Get the primary filename from phone entry
 */
function getPrimaryFileName(phone: PhoneBookPhone): string {
  if (Array.isArray(phone.file)) {
    return phone.file[0];
  }
  return phone.file;
}

/**
 * Parse phone_book.json into flat list of phones
 */
function parsePhoneBook(
  brands: PhoneBookBrand[], 
  domain: string, 
  quality: 'high' | 'low'
): ParsedPhone[] {
  const phones: ParsedPhone[] = [];
  
  for (const brand of brands) {
    for (const phone of brand.phones) {
      const fileName = getPrimaryFileName(phone);
      if (!fileName) continue;
      
      phones.push({
        type: classifyItem(`${brand.name} ${phone.name}`, domain),
        brandName: brand.name,
        phoneName: phone.name,
        displayName: `${brand.name} ${phone.name}`,
        fileName,
        price: parsePrice(phone.price),
        domain,
        quality,
      });
    }
  }
  
  return phones;
}

/**
 * Parse frequency response text file (REW format)
 */
function parseFrequencyResponse(text: string): FrequencyCurve {
  const frequencies: number[] = [];
  const db: number[] = [];
  
  const lines = text.split(/[\r\n]+/);
  
  for (const line of lines) {
    // Skip comments and headers
    if (line.startsWith('*') || line.trim() === '') continue;
    
    // Parse tab or whitespace separated values
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
 * Fetch measurement data for a single phone
 */
async function fetchMeasurement(
  phone: ParsedPhone
): Promise<IEM | null> {
  const encodedFile = encodeURIComponent(phone.fileName);
  // Try Left channel first (most common)
  const url = `https://${phone.domain}/data/${encodedFile}%20L.txt`;
  
  try {
    const response = await fetchWithTimeout(url, MEASUREMENT_TIMEOUT);
    
    if (!response.ok) {
      // Try without L suffix as fallback
      const altUrl = `https://${phone.domain}/data/${encodedFile}.txt`;
      const altResponse = await fetchWithTimeout(altUrl, MEASUREMENT_TIMEOUT);
      
      if (!altResponse.ok) {
        return null;
      }
      
      const text = await altResponse.text();
      const frequencyData = parseFrequencyResponse(text);
      
      if (frequencyData.frequencies.length < 10) {
        return null; // Not enough data points
      }
      
      return {
        id: `${phone.domain}-${phone.fileName}`.replace(/\s+/g, '-'),
        name: phone.displayName,
        frequencyData,
        sourceDomain: phone.domain,
        quality: phone.quality,
        price: phone.price,
        type: phone.type,
      };
    }
    
    const text = await response.text();
    const frequencyData = parseFrequencyResponse(text);
    
    if (frequencyData.frequencies.length < 10) {
      return null; // Not enough data points
    }
    
    return {
      id: `${phone.domain}-${phone.fileName}`.replace(/\s+/g, '-'),
      name: phone.displayName,
      frequencyData,
      sourceDomain: phone.domain,
      quality: phone.quality,
      price: phone.price,
      type: phone.type,
    };
  } catch (error: any) {
    // Silently fail for individual measurements
    return null;
  }
}

/**
 * Process measurements in batches to avoid overwhelming servers
 */
async function fetchMeasurementsInBatches(
  phones: ParsedPhone[],
  batchSize: number = MAX_CONCURRENT_MEASUREMENTS
): Promise<IEM[]> {
  const iems: IEM[] = [];
  
  for (let i = 0; i < phones.length; i += batchSize) {
    const batch = phones.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(phone => fetchMeasurement(phone))
    );
    
    for (const result of results) {
      if (result) {
        iems.push(result);
      }
    }
  }
  
  return iems;
}

/**
 * Scan a specific URL for phone_book.json and measurements
 */
async function scanUrl(
  url: string, 
  domainKey: string, 
  quality: 'high' | 'low',
  isProbe: boolean = false
): Promise<IEM[]> {
  try {
    const response = await fetchWithTimeout(url, PHONE_BOOK_TIMEOUT);
    
    if (!response.ok) {
      if (!isProbe) {
        errorLog.push({
          domain: domainKey,
          error: `phone_book.json fetch failed: ${response.status}`,
          timestamp: new Date().toISOString(),
        });
      }
      return [];
    }
    
    const brands: PhoneBookBrand[] = await response.json();
    const phones = parsePhoneBook(brands, domainKey, quality);
    
    console.log(`[${domainKey}] Found ${phones.length} phones at ${url}`);
    
    // Fetch all measurements
    const iems = await fetchMeasurementsInBatches(phones);
    
    console.log(`[${domainKey}] Successfully fetched ${iems.length} measurements`);
    
    return iems;
  } catch (error: any) {
    if (!isProbe) {
      errorLog.push({
        domain: domainKey,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
    return [];
  }
}

/**
 * Scan a configured target (DomainConfig), potentially probing multiple paths
 */
async function scanDomain(config: DomainConfig): Promise<IEM[]> {
  const { name, domain, fullUrl, quality } = config;

  // Case 1: Override Full URL
  if (fullUrl) {
    // Extract base domain for measurement fetching (remove /data/phone_book.json)
    const baseUrl = fullUrl.replace(/\/data\/phone_book\.json$/, '');
    // Remove protocol for storage/ID (e.g. "graph.hangout.audio/iem/711")
    const domainKey = baseUrl.replace(/^https?:\/\//, '');
    
    return scanUrl(fullUrl, domainKey, quality);
  }

  // Case 2: Standard Squiglink Probing
  if (domain) {
    for (const path of PROBE_PATHS) {
      // Construct URL: https://{domain}/{path}/data/phone_book.json
      // Handle empty path correctly
      const pathPart = path ? `${path}/` : '';
      const url = `https://${domain}/${pathPart}data/phone_book.json`;
      
      // Domain key for measurements: {domain}/{path} (no protocol)
      // e.g. "hbb.squig.link" or "hbb.squig.link/iems"
      const domainKey = `${domain}/${pathPart}`.replace(/\/$/, '');
      
      const iems = await scanUrl(url, domainKey, quality, true); // true = silent fail on 404
      
      if (iems.length > 0) {
        // Stop probing this domain if we found a valid DB (matching check.py behavior)
        // If check.py behavior implies finding ALL DBs, we should not return here.
        // check.py says: "if data: parse...; break" -> It stops after first find.
        return iems;
      }
    }
    
    // If we get here, all probes failed
    errorLog.push({
      domain: name,
      error: `Could not find phone_book.json in any probe path on ${domain}`,
      timestamp: new Date().toISOString(),
    });
  }

  return [];
}

/**
 * Remove duplicate IEMs, preferring high quality sources
 */
function removeDuplicates(iems: IEM[]): IEM[] {
  const seen = new Map<string, IEM>();
  
  // Sort so high quality comes first
  const sorted = [...iems].sort((a, b) => {
    if (a.quality === 'high' && b.quality !== 'high') return -1;
    if (a.quality !== 'high' && b.quality === 'high') return 1;
    return 0;
  });
  
  for (const iem of sorted) {
    const key = iem.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) {
      seen.set(key, iem);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Scan all configured domains for IEMs
 */
async function scanAllDomains(): Promise<IEM[]> {
  errorLog = []; // Reset error log
  
  console.log(`Starting scan of ${SQUIGLINK_DOMAINS.length} targets...`);
  
  // Scan all domains in parallel
  const results = await Promise.all(
    SQUIGLINK_DOMAINS.map(config => scanDomain(config))
  );
  
  // Flatten results
  const allIEMs = results.flat();
  
  console.log(`Total IEMs before dedup: ${allIEMs.length}`);
  
  // Remove duplicates, preferring high quality
  const uniqueIEMs = removeDuplicates(allIEMs);
  
  console.log(`Total unique IEMs: ${uniqueIEMs.length}`);
  
  // Log errors if any
  if (errorLog.length > 0) {
    console.warn(`Errors encountered: ${errorLog.length}`);
  }
  
  return uniqueIEMs;
}

/**
 * Get the error log from the last scan
 */
function getErrorLog(): ErrorEntry[] {
  return [...errorLog];
}

export { scanAllDomains, scanDomain, getErrorLog, parseFrequencyResponse };
