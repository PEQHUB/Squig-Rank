#!/usr/bin/env node
/**
 * Squig.link IEM Scanner
 * 
 * Scans all squig.link subdomains for IEM frequency response data,
 * calculates similarity scores against target curves, and outputs results.
 * 
 * Features:
 * - Incremental scanning (only fetches new IEMs)
 * - Filters out headphones and TWS
 * - Supports domain overrides for special cases
 * - Outputs pre-computed results for instant frontend loading
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUBDOMAINS = [
  "crinacle", "superreview", "hbb", "precog", "timmyv", "aftersound", 
  "paulwasabii", "vortexreviews", "tonedeafmonk", "rg", "nymz", 
  "gadgetrytech", "eliseaudio", "den-fi", "achoreviews", "aden", "adri-n", 
  "animagus", "ankramutt", "arc", "atechreviews", "arn", "audioamigo", 
  "theaudiostore", "awsmdanny", "bakkwatan", "banzai1122", "bassyalexander", 
  "bassaudio", "bedrock", "boizoff", "breampike", "bryaudioreviews", 
  "bukanaudiophile", "csi-zone", "dchpgall", "dhrme", "dl", "doltonius", 
  "ducbloke", "ekaudio", "fahryst", "enemyspider", "eplv", "flare", 
  "foxtoldmeso", "freeryder05", "hadoe", "harpo", "hore", "hu-fi", 
  "ianfann", "ideru", "iemocean", "iemworld", "isaiahse", "jacstone", 
  "jaytiss", "joshtbvo", "kazi", "kr0mka", "lestat", "listener", 
  "loomynarty", "lown-fi", "melatonin", "mmagtech", "musicafe", "obodio", 
  "practiphile", "pw", "ragnarok", "recode", "regancipher", "riz", "smirk", 
  "soundignity", "suporsalad", "tgx78", "therollo9", "scboy", "seanwee", 
  "silicagel", "sl0the", "soundcheck39", "tanchjim", "tedthepraimortis", 
  "treblewellxtended", "vsg", "yanyin", "yoshiultra", "kuulokenurkka", 
  "sai", "earphonesarchive"
];

const OVERRIDES = {
  "crinacle": "https://graph.hangout.audio/iem/711/data/phone_book.json",
  "crinacle5128": "https://graph.hangout.audio/iem/5128/data/phone_book.json",
  "crinacleHP": "https://graph.hangout.audio/hp/data/phone_book.json",
  "superreview": "https://squig.link/data/phone_book.json",
  "den-fi": "https://ish.squig.link/data/phone_book.json",
  "paulwasabii": "https://pw.squig.link/data/phone_book.json",
  "listener5128": "https://listener800.github.io/5128/data/phone_book.json"
};

const HIGH_QUALITY_DOMAINS = ["crinacle", "earphonesarchive", "sai"];

// Exclusion lists for filtering out headphones and TWS
const NOT_A_HEADPHONE = ["IEM", "In-Ear", "Monitor", "Earphone", "T10", "Planar IEM"];
const HP_SINGLES = [
  "(OE)", "Over-Ear", "On-Ear", "Closed-back", "Open-back", "Circumaural", 
  "Supra-aural", "HD600", "HD650", "HD800", "HD6XX", "HD560", "HD580", 
  "Sundara", "Ananda", "Susvara", "DT770", "DT880", "DT990", "DT1990", 
  "K701", "K702", "K371", "MDR-7506", "Porta Pro"
];
const HP_PAIRS = {
  "Dan Clark": ["Stealth", "Expanse", "Ether", "Aeon", "Corina", "DCA"],
  "ZMF": ["Atrium", "Verite", "Aeolus", "Eikon", "Auteur", "Caldera", "Bokeh"],
  "Focal": ["Clear", "Stellia", "Utopia", "Elex", "Radiance", "Bathys", "Hadenys"],
  "Audeze": ["Maxwell", "LCD", "Mobius", "Penrose"],
  "Meze": ["Elite", "Empyrean", "Liric", "109 Pro"]
};
const TWS_KEYWORDS = ["Earbud", "TWS", "Wireless", "Buds", "Pods", "True Wireless", "AirPods"];

// Timeouts
const PHONE_BOOK_TIMEOUT = 10000;
const MEASUREMENT_TIMEOUT = 5000;
const CONCURRENT_DOMAINS = 15;
const CONCURRENT_MEASUREMENTS = 25;

// Fast mode: scan high-quality domains first, then others
// Allows partial results if we timeout
const FAST_MODE = process.argv.includes('--fast');
const PRIORITY_DOMAINS = [...HIGH_QUALITY_DOMAINS, "superreview", "hbb", "precog", "timmyv", "aftersound"];

// Paths
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const RESULTS_PATH = path.join(DATA_DIR, 'results.json');
const TARGETS_DIR = path.join(__dirname, '..', 'public', 'targets');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'SquigRank-Scanner/1.0'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function getPhoneBookUrl(subdomain) {
  if (OVERRIDES[subdomain]) {
    return OVERRIDES[subdomain];
  }
  return `https://${subdomain}.squig.link/data/phone_book.json`;
}

function getDataBaseUrl(subdomain) {
  if (subdomain === 'crinacle') {
    return 'https://graph.hangout.audio/iem/711/data/';
  }
  if (subdomain === 'superreview') {
    return 'https://squig.link/data/';
  }
  if (subdomain === 'den-fi') {
    return 'https://ish.squig.link/data/';
  }
  if (subdomain === 'paulwasabii') {
    return 'https://pw.squig.link/data/';
  }
  return `https://${subdomain}.squig.link/data/`;
}

function parsePrice(priceStr) {
  if (!priceStr || priceStr === '$??' || priceStr === 'Free') return null;
  const cleaned = priceStr.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ============================================================================
// FILTERING FUNCTIONS
// ============================================================================

function isHeadphone(name) {
  const upperName = name.toUpperCase();
  
  // Check if explicitly marked as IEM (not a headphone)
  for (const marker of NOT_A_HEADPHONE) {
    if (upperName.includes(marker.toUpperCase())) {
      return false; // It's an IEM
    }
  }
  
  // Check single keywords that indicate headphone
  for (const keyword of HP_SINGLES) {
    if (upperName.includes(keyword.toUpperCase())) {
      return true;
    }
  }
  
  // Check brand + model pairs
  for (const [brand, models] of Object.entries(HP_PAIRS)) {
    if (upperName.includes(brand.toUpperCase())) {
      for (const model of models) {
        if (upperName.includes(model.toUpperCase())) {
          return true;
        }
      }
    }
  }
  
  return false;
}

function isTWS(name) {
  const upperName = name.toUpperCase();
  for (const keyword of TWS_KEYWORDS) {
    if (upperName.includes(keyword.toUpperCase())) {
      return true;
    }
  }
  return false;
}

function shouldInclude(name) {
  return !isHeadphone(name) && !isTWS(name);
}

// ============================================================================
// FREQUENCY RESPONSE PARSING
// ============================================================================

function parseFrequencyResponse(text) {
  const frequencies = [];
  const db = [];
  
  const lines = text.split(/[\r\n]+/);
  for (const line of lines) {
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

// ============================================================================
// R40 ALIGNMENT & SIMILARITY CALCULATION
// ============================================================================

function generateR40Frequencies() {
  const frequencies = [];
  let current = 20;
  while (current <= 20000) {
    frequencies.push(Math.round(current * 100) / 100);
    current = current * Math.pow(2, 1 / 12);
  }
  return frequencies;
}

const R40_FREQUENCIES = generateR40Frequencies();

function logInterpolate(freqs, dbs, targetFreq) {
  if (freqs.length === 0 || dbs.length === 0) return 0;
  if (targetFreq <= freqs[0]) return dbs[0];
  if (targetFreq >= freqs[freqs.length - 1]) return dbs[dbs.length - 1];
  
  let low = 0, high = freqs.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (freqs[mid] <= targetFreq) low = mid;
    else high = mid;
  }
  
  const logF1 = Math.log10(freqs[low]);
  const logF2 = Math.log10(freqs[high]);
  const logTarget = Math.log10(targetFreq);
  const t = (logTarget - logF1) / (logF2 - logF1);
  
  return dbs[low] + t * (dbs[high] - dbs[low]);
}

function alignToR40(curve) {
  if (!curve.frequencies.length) {
    return { frequencies: [...R40_FREQUENCIES], db: R40_FREQUENCIES.map(() => 0) };
  }
  const alignedDb = R40_FREQUENCIES.map(f => logInterpolate(curve.frequencies, curve.db, f));
  return { frequencies: [...R40_FREQUENCIES], db: alignedDb };
}

function normalizeCurve(curve, refFreq = 1000) {
  const refDb = logInterpolate(curve.frequencies, curve.db, refFreq);
  return {
    frequencies: [...curve.frequencies],
    db: curve.db.map(d => d - refDb)
  };
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);
  const meanX = mean(xSlice);
  const meanY = mean(ySlice);
  
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

const FREQUENCY_BANDS = [
  { name: "Bass", min: 20, max: 100, weight: 0.10 },
  { name: "Mids", min: 100, max: 10000, weight: 0.80 },
  { name: "Treble", min: 10000, max: 20000, weight: 0.10 }
];

function extractBand(curve, minFreq, maxFreq) {
  const values = [];
  for (let i = 0; i < curve.frequencies.length; i++) {
    if (curve.frequencies[i] >= minFreq && curve.frequencies[i] < maxFreq) {
      values.push(curve.db[i]);
    }
  }
  return values;
}

function calculateSimilarity(iemCurve, targetCurve) {
  const iem = normalizeCurve(alignToR40(iemCurve));
  const target = normalizeCurve(alignToR40(targetCurve));
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const band of FREQUENCY_BANDS) {
    const iemBand = extractBand(iem, band.min, band.max);
    const targetBand = extractBand(target, band.min, band.max);
    
    if (iemBand.length < 3 || targetBand.length < 3) continue;
    
    const correlation = pearsonCorrelation(iemBand, targetBand);
    weightedSum += correlation * band.weight;
    totalWeight += band.weight;
  }
  
  if (totalWeight === 0) return 0;
  return (weightedSum / totalWeight) * 100;
}

// ============================================================================
// MANIFEST MANAGEMENT
// ============================================================================

function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load manifest, starting fresh');
  }
  return { iems: {}, lastFullScan: null };
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function getIemKey(subdomain, fileName) {
  return `${subdomain}::${fileName}`;
}

// ============================================================================
// SCANNING FUNCTIONS
// ============================================================================

async function fetchPhoneBook(subdomain) {
  const url = getPhoneBookUrl(subdomain);
  try {
    const response = await fetchWithTimeout(url, PHONE_BOOK_TIMEOUT);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

async function fetchMeasurement(subdomain, fileName) {
  const baseUrl = getDataBaseUrl(subdomain);
  const encodedFile = encodeURIComponent(fileName);
  
  // Try L channel first
  const urlL = `${baseUrl}${encodedFile}%20L.txt`;
  try {
    const response = await fetchWithTimeout(urlL, MEASUREMENT_TIMEOUT);
    if (response.ok) {
      const text = await response.text();
      return parseFrequencyResponse(text);
    }
  } catch (e) {}
  
  // Try without L suffix
  const url = `${baseUrl}${encodedFile}.txt`;
  try {
    const response = await fetchWithTimeout(url, MEASUREMENT_TIMEOUT);
    if (response.ok) {
      const text = await response.text();
      return parseFrequencyResponse(text);
    }
  } catch (e) {}
  
  return null;
}

function extractPhonesFromPhoneBook(phoneBook, subdomain) {
  const phones = [];
  
  for (const brand of phoneBook) {
    if (!brand.phones) continue;
    
    for (const phone of brand.phones) {
      const fileName = Array.isArray(phone.file) ? phone.file[0] : phone.file;
      if (!fileName) continue;
      
      const displayName = `${brand.name} ${phone.name}`;
      
      // Filter out headphones and TWS
      if (!shouldInclude(displayName)) continue;
      
      phones.push({
        subdomain,
        brandName: brand.name,
        phoneName: phone.name,
        displayName,
        fileName,
        price: parsePrice(phone.price),
        quality: HIGH_QUALITY_DOMAINS.includes(subdomain) ? 'high' : 'low'
      });
    }
  }
  
  return phones;
}

async function scanDomain(subdomain, manifest) {
  console.log(`  Scanning ${subdomain}...`);
  
  const phoneBook = await fetchPhoneBook(subdomain);
  if (!phoneBook) {
    console.log(`    Failed to fetch phone_book.json`);
    return { phones: [], newCount: 0 };
  }
  
  const allPhones = extractPhonesFromPhoneBook(phoneBook, subdomain);
  console.log(`    Found ${allPhones.length} IEMs (after filtering)`);
  
  // Count new vs existing for logging
  let newCount = 0;
  for (const phone of allPhones) {
    const key = getIemKey(subdomain, phone.fileName);
    if (!manifest.iems[key]) newCount++;
  }
  console.log(`    New: ${newCount}, Existing: ${allPhones.length - newCount}`);
  
  // Fetch all measurements (can't cache frequency data - too large)
  const phonesWithData = [];
  
  for (let i = 0; i < allPhones.length; i += CONCURRENT_MEASUREMENTS) {
    const batch = allPhones.slice(i, i + CONCURRENT_MEASUREMENTS);
    const results = await Promise.all(
      batch.map(async (phone) => {
        const measurement = await fetchMeasurement(subdomain, phone.fileName);
        if (measurement && measurement.frequencies.length >= 10) {
          return { ...phone, frequencyData: measurement };
        }
        return null;
      })
    );
    
    for (const result of results) {
      if (result) {
        phonesWithData.push(result);
        // Update manifest (only store metadata, not frequency data - too large!)
        const key = getIemKey(subdomain, result.fileName);
        manifest.iems[key] = {
          price: result.price,
          quality: result.quality,
          lastSeen: new Date().toISOString()
        };
      }
    }
  }
  
  return { phones: phonesWithData, newCount };
}

// ============================================================================
// TARGET LOADING
// ============================================================================

function loadTargets() {
  const targets = [];
  
  // ISO 11904-2 DF target
  const isoPath = path.join(TARGETS_DIR, 'ISO 11904-2 DF (Tilt_ -0.8dB_Oct, B₁₀₅ 3dB)-Compensated.txt');
  if (fs.existsSync(isoPath)) {
    const text = fs.readFileSync(isoPath, 'utf-8');
    targets.push({
      name: 'ISO 11904-2 DF',
      curve: parseFrequencyResponse(text)
    });
  } else {
    console.warn('ISO 11904-2 target not found');
  }
  
  // Harman 2019 target
  const harmanPath = path.join(TARGETS_DIR, 'Harman 2019 Target.txt');
  if (fs.existsSync(harmanPath)) {
    const text = fs.readFileSync(harmanPath, 'utf-8');
    targets.push({
      name: 'Harman 2019',
      curve: parseFrequencyResponse(text)
    });
  } else {
    console.warn('Harman 2019 target not found');
  }
  
  return targets;
}

// ============================================================================
// MAIN
// ============================================================================

// Global state for graceful shutdown
let currentManifest = null;
let currentPhones = [];
let targetsGlobal = [];

function savePartialResults() {
  if (!currentManifest || targetsGlobal.length === 0) return;
  
  console.log('\n--- Saving partial results ---');
  saveManifest(currentManifest);
  
  // Generate results from what we have
  const seen = new Map();
  const sortedPhones = [...currentPhones].sort((a, b) => {
    if (a.quality === 'high' && b.quality !== 'high') return -1;
    if (a.quality !== 'high' && b.quality === 'high') return 1;
    return 0;
  });
  
  for (const phone of sortedPhones) {
    const key = phone.displayName.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, phone);
    }
  }
  
  const uniquePhones = Array.from(seen.values());
  const results = [];
  
  for (const target of targetsGlobal) {
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => ({
        id: getIemKey(phone.subdomain, phone.fileName),
        name: phone.displayName,
        similarity: calculateSimilarity(phone.frequencyData, target.curve),
        price: phone.price,
        quality: phone.quality,
        sourceDomain: `${phone.subdomain}.squig.link`
      }));
    
    scored.sort((a, b) => b.similarity - a.similarity);
    results.push({ targetName: target.name, ranked: scored });
  }
  
  const output = {
    generatedAt: new Date().toISOString(),
    totalIEMs: uniquePhones.length,
    partial: true,
    results
  };
  
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`Partial results saved: ${uniquePhones.length} IEMs`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nInterrupted! Saving progress...');
  savePartialResults();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nTerminated! Saving progress...');
  savePartialResults();
  process.exit(0);
});

async function main() {
  console.log('=== Squig.link IEM Scanner ===\n');
  console.log(`Mode: ${FAST_MODE ? 'FAST (priority domains only)' : 'FULL'}`);
  console.log(`Concurrency: ${CONCURRENT_DOMAINS} domains, ${CONCURRENT_MEASUREMENTS} measurements\n`);
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Load manifest
  const manifest = loadManifest();
  currentManifest = manifest;
  console.log(`Manifest: ${Object.keys(manifest.iems).length} known IEMs\n`);
  
  // Load targets
  const targets = loadTargets();
  targetsGlobal = targets;
  console.log(`Loaded ${targets.length} target curves\n`);
  
  if (targets.length === 0) {
    console.error('No target curves found! Exiting.');
    process.exit(1);
  }
  
  // Reorder domains: priority first, then rest
  const prioritySet = new Set(PRIORITY_DOMAINS);
  const orderedDomains = [
    ...PRIORITY_DOMAINS.filter(d => SUBDOMAINS.includes(d)),
    ...SUBDOMAINS.filter(d => !prioritySet.has(d))
  ];
  
  const domainsToScan = FAST_MODE ? PRIORITY_DOMAINS.filter(d => SUBDOMAINS.includes(d)) : orderedDomains;
  
  console.log(`Scanning ${domainsToScan.length} domains${FAST_MODE ? ' (FAST MODE)' : ''}...\n`);
  
  const allPhones = [];
  let totalNew = 0;
  
  // Process domains in batches with progress saving
  for (let i = 0; i < domainsToScan.length; i += CONCURRENT_DOMAINS) {
    const batch = domainsToScan.slice(i, i + CONCURRENT_DOMAINS);
    const batchNum = Math.floor(i / CONCURRENT_DOMAINS) + 1;
    const totalBatches = Math.ceil(domainsToScan.length / CONCURRENT_DOMAINS);
    console.log(`\n--- Batch ${batchNum}/${totalBatches} ---`);
    
    const results = await Promise.all(
      batch.map(subdomain => scanDomain(subdomain, manifest))
    );
    
    for (const result of results) {
      allPhones.push(...result.phones);
      currentPhones = allPhones;
      totalNew += result.newCount;
    }
    
    // Save manifest after each batch to preserve progress
    saveManifest(manifest);
    console.log(`  Progress saved: ${Object.keys(manifest.iems).length} IEMs in manifest`);
  }
  
  console.log(`\nTotal IEMs collected: ${allPhones.length}`);
  console.log(`New IEMs this scan: ${totalNew}\n`);
  
  // Remove duplicates (prefer high quality)
  const seen = new Map();
  const sortedPhones = [...allPhones].sort((a, b) => {
    if (a.quality === 'high' && b.quality !== 'high') return -1;
    if (a.quality !== 'high' && b.quality === 'high') return 1;
    return 0;
  });
  
  for (const phone of sortedPhones) {
    const key = phone.displayName.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, phone);
    }
  }
  
  const uniquePhones = Array.from(seen.values());
  console.log(`Unique IEMs after dedup: ${uniquePhones.length}\n`);
  
  // Calculate similarity scores for each target
  const results = [];
  
  for (const target of targets) {
    console.log(`Calculating similarity for: ${target.name}`);
    
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => ({
        id: getIemKey(phone.subdomain, phone.fileName),
        name: phone.displayName,
        similarity: calculateSimilarity(phone.frequencyData, target.curve),
        price: phone.price,
        quality: phone.quality,
        sourceDomain: `${phone.subdomain}.squig.link`
      }));
    
    // Sort by similarity (desc), then price (asc)
    scored.sort((a, b) => {
      if (Math.abs(b.similarity - a.similarity) > 0.01) {
        return b.similarity - a.similarity;
      }
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });
    
    results.push({
      targetName: target.name,
      ranked: scored  // Save all scored IEMs for pagination
    });
    
    console.log(`  Top match: ${scored[0]?.name} (${scored[0]?.similarity.toFixed(1)}%)`);
  }
  
  // Save results
  const output = {
    generatedAt: new Date().toISOString(),
    totalIEMs: uniquePhones.length,
    domainsScanned: domainsToScan.length,
    results
  };
  
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`Results saved to ${RESULTS_PATH}`);
  
  // Save updated manifest
  manifest.lastFullScan = new Date().toISOString();
  saveManifest(manifest);
  console.log(`Manifest saved to ${MANIFEST_PATH}`);
  
  console.log('\n=== Scan Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
