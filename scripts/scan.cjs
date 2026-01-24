#!/usr/bin/env node
/**
 * Squig.link IEM Scanner
 * 
 * Scans all squig.link subdomains for IEM frequency response data,
 * calculates similarity scores against target curves, and outputs results.
 */

const fs = require('fs');
const path = require('path');
const { parseFrequencyResponse } = require('./utils.cjs');
const { calculatePPI } = require('./ranker.cjs');

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
  "sai", "earphonesarchive",
  "crinacle5128", "listener5128"
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

// Domains that use B&K 5128 measurement rig (vs standard 711)
const RIG_5128_DOMAINS = [
  "earphonesarchive", 
  "crinacle5128",
  "listener5128"
];

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

// Fast mode
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
  if (OVERRIDES[subdomain]) return OVERRIDES[subdomain];
  return `https://${subdomain}.squig.link/data/phone_book.json`;
}

function getDataBaseUrl(subdomain) {
  if (subdomain === 'crinacle') return 'https://graph.hangout.audio/iem/711/data/';
  if (subdomain === 'superreview') return 'https://squig.link/data/';
  if (subdomain === 'den-fi') return 'https://ish.squig.link/data/';
  if (subdomain === 'paulwasabii') return 'https://pw.squig.link/data/';
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
  for (const marker of NOT_A_HEADPHONE) {
    if (upperName.includes(marker.toUpperCase())) return false;
  }
  for (const keyword of HP_SINGLES) {
    if (upperName.includes(keyword.toUpperCase())) return true;
  }
  for (const [brand, models] of Object.entries(HP_PAIRS)) {
    if (upperName.includes(brand.toUpperCase())) {
      for (const model of models) {
        if (upperName.includes(model.toUpperCase())) return true;
      }
    }
  }
  return false;
}

function isTWS(name) {
  const upperName = name.toUpperCase();
  for (const keyword of TWS_KEYWORDS) {
    if (upperName.includes(keyword.toUpperCase())) return true;
  }
  return false;
}

function shouldInclude(name) {
  return !isHeadphone(name) && !isTWS(name);
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
  
  // Fetch all measurements
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
  const targetGroups = new Map(); // name -> { name, 711: {curve, fileName}, 5128: {curve, fileName} }
  
  if (!fs.existsSync(TARGETS_DIR)) return [];
  
  const targetFiles = fs.readdirSync(TARGETS_DIR).filter(f => f.endsWith('.txt') && !f.includes('comp'));
  
  for (const fileName of targetFiles) {
    const filePath = path.join(TARGETS_DIR, fileName);
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const curve = parseFrequencyResponse(text);
      
      if (curve.frequencies.length >= 10) {
        const is5128 = fileName.toLowerCase().includes('5128');
        // Base name: remove " (5128)", " (711)" and ".txt"
        let baseName = fileName
          .replace(/\s*\(5128\)/i, '')
          .replace(/\s*\(711\)/i, '')
          .replace('.txt', '')
          .trim();
        
        if (!targetGroups.has(baseName)) {
          targetGroups.set(baseName, { name: baseName, '711': null, '5128': null });
        }
        
        const group = targetGroups.get(baseName);
        const type = is5128 ? '5128' : '711';
        
        group[type] = {
          fileName: fileName,
          curve: curve
        };
        
        console.log(`  Loaded target: ${fileName} [${type}] -> Group: ${baseName}`);
      }
    } catch (e) {
      console.warn(`  Failed to load target: ${fileName}`);
    }
  }
  
  return Array.from(targetGroups.values());
}

// ============================================================================
// MAIN
// ============================================================================

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
  
  for (const group of targetsGlobal) {
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => {
        const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain) || 
                          phone.fileName.includes('(5128)') || 
                          phone.displayName.includes('(5128)');
        
        let targetVariant = '711';
        let targetData = group['711'];
        
        if (is5128Rig) {
          if (group['5128']) {
            targetVariant = '5128';
            targetData = group['5128'];
          } else {
            targetVariant = '711';
            targetData = group['711'];
            console.warn(`[WARNING] No 5128 target found for ${group.name}, falling back to 711 for ${phone.displayName}`);
          }
        } else {
          // 711 Rig
          if (group['711']) {
            targetVariant = '711';
            targetData = group['711'];
          } else {
            targetVariant = '5128';
            targetData = group['5128'];
            console.warn(`[WARNING] No 711 target found for ${group.name}, falling back to 5128 for ${phone.displayName}`);
          }
        }

        if (!targetData) return null;
        
        const ppiResult = calculatePPI(phone.frequencyData, targetData.curve);
        
        return {
          id: getIemKey(phone.subdomain, phone.fileName),
          name: phone.displayName,
          similarity: ppiResult.ppi,
          stdev: ppiResult.stdev,
          slope: ppiResult.slope,
          avgError: ppiResult.avgError,
          price: phone.price,
          quality: phone.quality,
          sourceDomain: `${phone.subdomain}.squig.link`,
          rig: is5128Rig ? '5128' : '711',
          targetVariant: targetVariant
        };
      })
      .filter(x => x !== null);
    
    scored.sort((a, b) => {
      if (Math.abs(b.similarity - a.similarity) > 0.01) {
        return b.similarity - a.similarity;
      }
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });
    
    results.push({ 
      targetName: group.name,
      targetFiles: {
        '711': group['711'] ? group['711'].fileName : null,
        '5128': group['5128'] ? group['5128'].fileName : null
      },
      scoringMethod: 'ppi', 
      ranked: scored 
    });
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
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const manifest = loadManifest();
  currentManifest = manifest;
  console.log(`Manifest: ${Object.keys(manifest.iems).length} known IEMs\n`);
  
  const targets = loadTargets();
  targetsGlobal = targets;
  console.log(`Loaded ${targets.length} target groups`);
  
  console.log('');
  
  if (targets.length === 0) {
    console.error('No target curves found! Exiting.');
    process.exit(1);
  }
  
  const prioritySet = new Set(PRIORITY_DOMAINS);
  const orderedDomains = [
    ...PRIORITY_DOMAINS.filter(d => SUBDOMAINS.includes(d)),
    ...SUBDOMAINS.filter(d => !prioritySet.has(d))
  ];
  
  const domainsToScan = FAST_MODE ? PRIORITY_DOMAINS.filter(d => SUBDOMAINS.includes(d)) : orderedDomains;
  
  console.log(`Scanning ${domainsToScan.length} domains${FAST_MODE ? ' (FAST MODE)' : ''}...\n`);
  
  const allPhones = [];
  let totalNew = 0;
  
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
    
    saveManifest(manifest);
    console.log(`  Progress saved: ${Object.keys(manifest.iems).length} IEMs in manifest`);
  }
  
  console.log(`\nTotal IEMs collected: ${allPhones.length}`);
  console.log(`New IEMs this scan: ${totalNew}\n`);
  
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
  
  const results = [];
  
  for (const group of targets) {
    console.log(`Calculating PPI for: ${group.name}`);
    
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => {
        const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain) || 
                          phone.fileName.includes('(5128)') || 
                          phone.displayName.includes('(5128)');
        
        let targetVariant = '711';
        let targetData = group['711'];
        
        if (is5128Rig) {
          if (group['5128']) {
            targetVariant = '5128';
            targetData = group['5128'];
          } else {
            targetVariant = '711';
            targetData = group['711'];
          }
        } else {
          if (group['711']) {
            targetVariant = '711';
            targetData = group['711'];
          } else {
            targetVariant = '5128';
            targetData = group['5128'];
          }
        }

        if (!targetData) return null;
        
        const ppiResult = calculatePPI(phone.frequencyData, targetData.curve);
        
        return {
          id: getIemKey(phone.subdomain, phone.fileName),
          name: phone.displayName,
          similarity: ppiResult.ppi,
          stdev: ppiResult.stdev,
          slope: ppiResult.slope,
          avgError: ppiResult.avgError,
          price: phone.price,
          quality: phone.quality,
          sourceDomain: `${phone.subdomain}.squig.link`,
          rig: is5128Rig ? '5128' : '711',
          targetVariant: targetVariant
        };
      })
      .filter(x => x !== null);
    
    scored.sort((a, b) => {
      if (Math.abs(b.similarity - a.similarity) > 0.01) {
        return b.similarity - a.similarity;
      }
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });
    
    results.push({
      targetName: group.name,
      targetFiles: {
        '711': group['711'] ? group['711'].fileName : null,
        '5128': group['5128'] ? group['5128'].fileName : null
      },
      scoringMethod: 'ppi',
      ranked: scored
    });
    
    console.log(`  Top match: ${scored[0]?.name} (PPI: ${scored[0]?.similarity.toFixed(1)})`);
  }
  
  const output = {
    generatedAt: new Date().toISOString(),
    totalIEMs: uniquePhones.length,
    domainsScanned: domainsToScan.length,
    results
  };
  
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`Results saved to ${RESULTS_PATH}`);
  
  manifest.lastFullScan = new Date().toISOString();
  saveManifest(manifest);
  console.log(`Manifest saved to ${MANIFEST_PATH}`);
  
  console.log('\n=== Scan Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
