#!/usr/bin/env node
/**
 * Squig.link IEM Scanner
 * 
 * Scans all squig.link subdomains for IEM frequency response data,
 * calculates similarity scores against target curves, and outputs results.
 */

const fs = require('fs');
const path = require('path');
const { parseFrequencyResponse, averageCurves } = require('./utils.cjs');
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
    // Extras supported by app logic or known
    "crinacle5128", "listener5128", "crinacleHP"
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

const HIGH_QUALITY_DOMAINS = ["crinacle", "earphonesarchive", "sai", "crinacle5128"];

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

async function fetchJson(url) {
  try {
    const response = await fetchWithTimeout(url, PHONE_BOOK_TIMEOUT);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
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

function isHeadphone(name, subdomain) {
  const upperName = name.toUpperCase();
  
  // Logic from check.py
  // is_hp_path check
  const isHpPath = subdomain.includes('5128') || subdomain.toLowerCase().includes('headphone') || subdomain.includes('hp'); // approximate check
  
  // has_iem_keyword
  let hasIemKeyword = false;
  for (const marker of NOT_A_HEADPHONE) {
    if (upperName.includes(marker.toUpperCase())) {
      hasIemKeyword = true;
      break;
    }
  }

  // has_hp_single
  let hasHpSingle = false;
  for (const keyword of HP_SINGLES) {
    if (upperName.includes(keyword.toUpperCase())) {
      hasHpSingle = true;
      break;
    }
  }

  // has_hp_pair
  let hasHpPair = false;
  for (const [brand, models] of Object.entries(HP_PAIRS)) {
    if (upperName.includes(brand.toUpperCase())) {
      for (const model of models) {
        if (upperName.includes(model.toUpperCase())) {
          hasHpPair = true;
          break;
        }
      }
    }
    if (hasHpPair) break;
  }

  // Final logic
  // if (is_dedicated_hp or is_hp_path or has_hp_single or has_hp_pair) and not has_iem_keyword:
  if ((isHpPath || hasHpSingle || hasHpPair) && !hasIemKeyword) {
      // if "jaytiss" not in link_domain or (has_hp_single or has_hp_pair):
      if (!subdomain.includes('jaytiss') || hasHpSingle || hasHpPair) {
          return true;
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

function shouldInclude(name, subdomain) {
  // Include both IEMs and Headphones
  return !isTWS(name);
}

function detectPinna(name, subdomain) {
  const n = name.toLowerCase();
  // 5128
  if (subdomain.includes('5128') || n.includes('5128')) return '5128';
  
  // KB5 / KB50xx (Specific Model Numbers)
  if (n.includes('kb5') || n.includes('kb5000') || n.includes('kb5010') || n.includes('kb5011')) return 'kb5';
  
  // KB0065 / KB006x (Specific Model Numbers)
  if (n.includes('kb0065') || n.includes('kb0066') || n.includes('kb006x')) return 'kb0065';
  
  // Default (Standard GRAS or Unspecified)
  return 'gras';
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

async function fetchMeasurement(baseUrl, fileName) {
  const encodedFile = encodeURIComponent(fileName);
  
  // Try L and R channels
  const urlL = `${baseUrl}${encodedFile}%20L.txt`;
  const urlR = `${baseUrl}${encodedFile}%20R.txt`;
  
  try {
    const [respL, respR] = await Promise.all([
      fetchWithTimeout(urlL, MEASUREMENT_TIMEOUT).catch(() => null),
      fetchWithTimeout(urlR, MEASUREMENT_TIMEOUT).catch(() => null)
    ]);

    // If both exist, average them
    if (respL && respL.ok && respR && respR.ok) {
      const [textL, textR] = await Promise.all([respL.text(), respR.text()]);
      const curveL = parseFrequencyResponse(textL);
      const curveR = parseFrequencyResponse(textR);
      
      if (curveL.frequencies.length > 0 && curveR.frequencies.length > 0) {
        return averageCurves(curveL, curveR);
      }
      // Fallback if one is empty
      if (curveL.frequencies.length > 0) return curveL;
      if (curveR.frequencies.length > 0) return curveR;
    }

    // If only L exists
    if (respL && respL.ok) {
      const text = await respL.text();
      return parseFrequencyResponse(text);
    }
    
    // If only R exists (unlikely but possible)
    if (respR && respR.ok) {
      const text = await respR.text();
      return parseFrequencyResponse(text);
    }

  } catch (e) {
    // Ignore errors and try fallback
  }
  
  // Try without suffix (e.g. "Model.txt")
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
  const seenFiles = new Set();
  
  for (const brand of phoneBook) {
    if (!brand.phones) continue;
    
    for (const phone of brand.phones) {
      const fileName = Array.isArray(phone.file) ? phone.file[0] : phone.file;
      if (!fileName) continue;
      
      // Deduplicate by filename within this subdomain
      if (seenFiles.has(fileName)) continue;
      seenFiles.add(fileName);
      
      const displayName = `${brand.name} ${phone.name}`;
      
      // Filter out headphones and TWS
      // Pass subdomain for context-aware filtering
      if (!shouldInclude(displayName, subdomain)) continue;
      
      const type = isHeadphone(displayName, subdomain) ? 'headphone' : 'iem';
      const pinna = type === 'headphone' ? detectPinna(displayName, subdomain) : null;

      phones.push({
        subdomain,
        brandName: brand.name,
        phoneName: phone.name,
        displayName,
        fileName,
        price: parsePrice(phone.price),
        quality: HIGH_QUALITY_DOMAINS.includes(subdomain) ? 'high' : 'low',
        type,
        pinna
      });
    }
  }
  
  return phones;
}

async function scanDomain(subdomain, manifest) {
  console.log(`  Scanning ${subdomain}...`);
  
  let phoneBook = null;
  let baseUrl = '';

  // 1. Check Overrides
  if (OVERRIDES[subdomain]) {
    const url = OVERRIDES[subdomain];
    phoneBook = await fetchJson(url);
    if (phoneBook) {
      // Remove 'phone_book.json' to get base data URL
      baseUrl = url.replace('phone_book.json', '');
    }
  } 
  // 2. Probe standard paths
  else {
    const paths = ["", "iems", "headphones", "earbuds", "5128", "headphones/5128"];
    for (const path of paths) {
      const p = path ? `${path}/` : '';
      const url = `https://${subdomain}.squig.link/${p}data/phone_book.json`;
      
      const pb = await fetchJson(url);
      if (pb) {
        phoneBook = pb;
        baseUrl = `https://${subdomain}.squig.link/${p}data/`;
        console.log(`    Found DB at /${path}`);
        break;
      }
    }
  }

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
        const measurement = await fetchMeasurement(baseUrl, phone.fileName);
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
  const targetGroups = new Map(); 
  
  if (!fs.existsSync(TARGETS_DIR)) return [];
  
  const targetFiles = fs.readdirSync(TARGETS_DIR).filter(f => f.endsWith('.txt') && !f.includes('comp'));
  
  for (const fileName of targetFiles) {
    const filePath = path.join(TARGETS_DIR, fileName);
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const curve = parseFrequencyResponse(text);
      
      if (curve.frequencies.length >= 10) {
        let baseName = '';
        let variant = '';
        let type = 'iem'; // 'iem' or 'headphone'

        // Detect HP Targets
        if (fileName.includes('Harman 2018')) {
            baseName = 'Harman 2018';
            variant = 'default';
            type = 'headphone';
        } 
        else if (fileName.startsWith('5128 DF') || fileName.startsWith('KEMAR DF')) {
            baseName = 'Diffuse Field (Tilted)';
            type = 'headphone';
            if (fileName.includes('5128')) variant = '5128';
            else if (fileName.includes('KB50xx')) variant = 'kb5';
            else if (fileName.includes('KB006x')) variant = 'kb0065';
            else variant = 'default';
        }
        // Detect IEM Targets
        else {
            type = 'iem';
            const is5128 = fileName.toLowerCase().includes('5128');
            variant = is5128 ? '5128' : '711';
            
            baseName = fileName
              .replace(/\s*\(5128\)/i, '')
              .replace(/\s*\(711\)/i, '')
              .replace('.txt', '')
              .trim();
        }

        if (!targetGroups.has(baseName)) {
          targetGroups.set(baseName, { name: baseName, type, variants: {} });
        }
        
        const group = targetGroups.get(baseName);
        group.variants[variant] = { fileName, curve };
        
        console.log(`  Loaded target: ${fileName} [${variant}] -> Group: ${baseName} (${type})`);
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

function processType(phones, targets, typeLabel) {
  const results = [];
  console.log(`\n--- Processing ${typeLabel}s (${phones.length}) ---`);
  
  const desiredType = typeLabel === 'Headphone' ? 'headphone' : 'iem';

  for (const group of targets) {
    // Filter targets by type
    if (group.type && group.type !== desiredType) continue;

    console.log(`Calculating PPI for: ${group.name}`);
    
    const scored = phones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => {
        let targetVariant = 'default';
        let targetData = null;

        if (desiredType === 'iem') {
            const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain) || 
                              phone.fileName.includes('(5128)') || 
                              phone.displayName.includes('(5128)');
            
            // For IEMs, we have 711 and 5128 variants
            if (is5128Rig) {
                targetVariant = group.variants['5128'] ? '5128' : '711';
                targetData = group.variants[targetVariant];
            } else {
                targetVariant = group.variants['711'] ? '711' : '5128';
                targetData = group.variants[targetVariant];
            }
        } else {
            // Headphones
            if (phone.pinna === '5128') targetVariant = '5128';
            else if (phone.pinna === 'kb5') targetVariant = 'kb5';
            else if (phone.pinna === 'kb0065') targetVariant = 'kb0065';
            else targetVariant = 'default'; // gras/unknown

            targetData = group.variants[targetVariant];
            
            // Fallback for HPs
            if (!targetData) {
                if (group.variants['default']) {
                    targetVariant = 'default';
                    targetData = group.variants['default'];
                } else if (group.variants['kb5']) { // KB5 is common modern gras
                    targetVariant = 'kb5';
                    targetData = group.variants['kb5'];
                }
            }
        }

        if (!targetData) return null;
        
        const ppiResult = calculatePPI(phone.frequencyData, targetData.curve);
        
        const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain); // Simple check for rig field

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
          targetVariant: targetVariant,
          pinna: phone.pinna
        };
      })
      .filter(x => x !== null);
    
    scored.sort((a, b) => {
      if (Math.abs(b.similarity - a.similarity) > 0.01) {
        return b.similarity - a.similarity;
      }
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });
    
    // Construct targetFiles map for UI downloads
    const targetFiles = {};
    for (const [v, data] of Object.entries(group.variants)) {
        targetFiles[v] = data.fileName;
    }

    results.push({ 
      targetName: group.name,
      targetFiles,
      scoringMethod: 'ppi', 
      ranked: scored 
    });
    
    console.log(`  Top match: ${scored[0]?.name} (PPI: ${scored[0]?.similarity.toFixed(1)})`);
  }
  return results;
}

function savePartialResults() {
  if (!currentManifest || targetsGlobal.length === 0) return;
  
  console.log('\n--- Saving partial results ---');
  saveManifest(currentManifest);
  
  const phonesToProcess = [...currentPhones];
  
  // Split phones by type (default to 'iem' if undefined)
  const iems = phonesToProcess.filter(p => p.type !== 'headphone'); 
  // const headphones = phonesToProcess.filter(p => p.type === 'headphone'); 
  // For partial save, just saving IEMs is safer to avoid complexity
  
  const resultsIEM = processType(iems, targetsGlobal, 'IEM');
  
  const output = {
    generatedAt: new Date().toISOString(),
    totalIEMs: iems.length,
    partial: true,
    results: resultsIEM
  };
  
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`Partial results saved: ${iems.length} IEMs`);
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
  
  const phonesToProcess = [...allPhones];
  console.log(`Processing ${phonesToProcess.length} measurements (no deduplication)\n`);
  
  // Split phones by type
  const iems = phonesToProcess.filter(p => p.type === 'iem');
  const headphones = phonesToProcess.filter(p => p.type === 'headphone');
  
  // Process IEMs
  const resultsIEM = processType(iems, targetsGlobal, 'IEM');
  
  // Process Headphones
  const resultsHP = processType(headphones, targetsGlobal, 'Headphone'); // Note: Targets for HP might need to be different?
  // User said "I will add two initial targets" for HP.
  // Currently we only have IEM targets.
  // If we run HP against IEM targets, scores will be bad, but that's expected until targets arrive.
  
  const outputIEM = {
    generatedAt: new Date().toISOString(),
    totalIEMs: iems.length,
    domainsScanned: domainsToScan.length,
    results: resultsIEM
  };
  
  const outputHP = {
    generatedAt: new Date().toISOString(),
    totalIEMs: headphones.length,
    domainsScanned: domainsToScan.length,
    results: resultsHP
  };
  
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(outputIEM, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'results_hp.json'), JSON.stringify(outputHP, null, 2));
  
  console.log(`Results saved to ${RESULTS_PATH} (IEMs)`);
  console.log(`Results saved to ${path.join(DATA_DIR, 'results_hp.json')} (Headphones)`);

  // Create curves.json for client-side ranking
  console.log('Generating curves.json for client-side ranking...');
  
  // Load compensation curves for frontend usage
  const compPath711 = path.join(__dirname, '..', 'compensation', '711comp.txt');
  const compPath5128 = path.join(__dirname, '..', 'compensation', '5128comp.txt');
  
  let compensation711 = [];
  let compensation5128 = [];
  
  try {
    const { parseFrequencyResponse, alignToR40 } = require('./utils.cjs');
    
    if (fs.existsSync(compPath711)) {
        const compText = fs.readFileSync(compPath711, 'utf-8');
        const compCurve = parseFrequencyResponse(compText);
        const alignedComp = alignToR40(compCurve);
        compensation711 = alignedComp.db.map(v => Math.round(v * 100) / 100);
        console.log('Included 711 compensation curve in metadata');
    }
    
    if (fs.existsSync(compPath5128)) {
        const compText = fs.readFileSync(compPath5128, 'utf-8');
        const compCurve = parseFrequencyResponse(compText);
        const alignedComp = alignToR40(compCurve);
        compensation5128 = alignedComp.db.map(v => Math.round(v * 100) / 100);
        console.log('Included 5128 compensation curve in metadata');
    }
  } catch (e) {
    console.warn('Failed to include compensation curves:', e.message);
  }

  const curveData = {
    meta: {
      frequencies: require('./utils.cjs').R40_FREQUENCIES,
      compensation711,
      compensation5128
    },
    curves: {}
  };

  // Pre-calculate interpolation to R40 for all valid phones
  const { alignToR40 } = require('./utils.cjs');
  
  let curveCount = 0;
  for (const phone of phonesToProcess) {
    if (phone.frequencyData && phone.frequencyData.frequencies.length >= 10) {
      const id = getIemKey(phone.subdomain, phone.fileName);
      const aligned = alignToR40(phone.frequencyData);
      // Store only dB values to save space (frequencies are shared)
      // Round to 2 decimal places to save space
      curveData.curves[id] = aligned.db.map(v => Math.round(v * 100) / 100);
      curveCount++;
    }
  }
  
  const curvesPath = path.join(DATA_DIR, 'curves.json');
  fs.writeFileSync(curvesPath, JSON.stringify(curveData));
  console.log(`Saved ${curveCount} curves to ${curvesPath} (${(fs.statSync(curvesPath).size / 1024 / 1024).toFixed(2)} MB)`);
  
  manifest.lastFullScan = new Date().toISOString();
  saveManifest(manifest);
  console.log(`Manifest saved to ${MANIFEST_PATH}`);
  
  console.log('\n=== Scan Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
