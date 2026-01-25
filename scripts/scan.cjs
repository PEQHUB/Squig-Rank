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
    "sai", "earphonesarchive", "auricularesargentina", "cammyfi", "capraaudio",
    "elrics", "filk", "unheardlab",
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
  "listener5128",
  "den-fi"
];

const TWS_KEYWORDS = ["Earbud", "TWS", "Wireless", "Buds", "Pods", "True Wireless", "AirPods"];

// Timeouts
const PHONE_BOOK_TIMEOUT = 10000;
const MEASUREMENT_TIMEOUT = 5000;
const CONCURRENT_DOMAINS = 30;
const CONCURRENT_MEASUREMENTS = 50;

// Paths
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const RESULTS_PATH = path.join(DATA_DIR, 'results.json');
const TARGETS_DIR = path.join(__dirname, '..', 'public', 'targets');

// ============================================================================
// AIR-TIGHT CLASSIFICATION ENGINE (IE vs OE)
// ============================================================================

const STRICTLY_IE_BRANDS = [
  "KZ", "TRN", "LETSHUOER", "7HZ", "THIEAUDIO", "KIWI EARS", "TANGZU", "TANCHJIM", 
  "SIMGOT", "QOA", "KINERA", "NICEHCK", "TRIPOWIN", "DUNU", "SOFTEARS", "EMPIRE EARS", 
  "CAMPFIRE AUDIO", "VISION EARS", "UNIQUE MELODY", "ETYMOTIC", "DIREM", "SONICAST", 
  "UCOTECH", "NOSTALGIA AUDIO", "TONEMAY", "CUSTOM ART", "RHA", "AFO", "FEAULLE",
  "64 AUDIO", "AFUL", "ZIIGAAT", "JUZEAR", "HIDIZS", "SALNOTES", "IKKO", "MOONDROP CHU", 
  "MOONDROP ARIA", "WHIZZER", "FENGRU", "FAAEAL", "VENTURE ELECTRONICS", "VE MONK", 
  "YINMAN", "BGVP", "MOONDROP QUARKS", "MOONDROP SPACESHIP", "MOONDROP KATO", "MOONDROP LAN",
  "RE-2", "NA3", "A8", "D-FI"
];

const OE_MODEL_REGISTRY = [
  // Moondrop OE
  "MOONDROP VENUS", "MOONDROP COSMO", "MOONDROP PARA", "MOONDROP VOID", "MOONDROP JOKER", "GREAT GATSBY",
  // Sennheiser OE
  "HD600", "HD650", "HD800", "HD6XX", "HD560", "HD580", "HD660", "HD490", "SENNHEISER HE1", "HD25", "HD280", "HD300", "MOMENTUM",
  // Focal OE
  "FOCAL UTOPIA", "FOCAL CLEAR", "FOCAL STELLIA", "FOCAL ELEX", "FOCAL RADIANCE", "FOCAL BATHYS", "FOCAL HADENYS", "FOCAL AZURYS", "FOCAL LISTEN", "FOCAL ELEGIA", "FOCAL CELESTEE",
  // Sony OE
  "MDR-7506", "MDR-V6", "MDR-CD900ST", "MDR-Z1R", "MDR-Z7", "MDR-MV1", "MDR-1A", "WH-1000", "WH-CH",
  // Hifiman OE
  "SUNDARA", "ANANDA", "SUSVARA", "ARYA", "HE1000", "HE400", "EDITION XS", "DEVA", "SHANGRI-LA", "AUDIVINA", "HE-R9", "HE-R10",
  // Audeze OE
  "LCD-2", "LCD-3", "LCD-4", "LCD-X", "LCD-XC", "LCD-5", "LCD-MX4", "LCD-GX", "MAXWELL", "MOBIUS", "PENROSE", "MM-500", "MM-100",
  // Koss OE
  "KSC75", "PORTA PRO", "KPH30I", "KPH40", "UR20", "UR40",
  // FiiO OE
  "FT3", "FT5", "FT1", "JT1",
  // AKG OE
  "K701", "K702", "K612", "K240", "K141", "K550", "K812", "K712", "K371", "K361",
  // Audio-Technica OE
  "ATH-M50", "ATH-M40", "ATH-M30", "ATH-M20", "ATH-AD", "ATH-A", "ATH-R70X", "ATH-AW", "ATH-WP",
  // Final OE
  "FINAL D8000", "FINAL SONOROUS", "FINAL UX3000", "PANDORA",
  // Beyerdynamic OE
  "DT770", "DT880", "DT990", "DT1990", "DT1770", "DT700", "DT900", "AMIRON", "CUSTOM ONE", "T1", "T5"
];

const STRICTLY_IE_DOMAINS = [
  "dchpgall", "hbb", "precog", "timmyv", "aftersound", "paulwasabii", "tonedeafmonk", 
  "vortexreviews", "nymz", "rg", "tonedeafmonk", "eliseaudio", "achoreviews",
  "animagus", "ankramutt", "atechreviews", "awsmdanny", "bakkwatan", "banzai1122",
  "bassyalexander", "breampike", "bryaudioreviews", "bukanaudiophile", "csi-zone",
  "ekaudio", "enemyspider", "eplv", "foxtoldmeso", "freeryder05", "hu-fi", "ianfann",
  "ideru", "iemocean", "iemworld", "isaiahse", "jacstone", "jaytiss", "joshtbvo",
  "kazi", "lestat", "loomynarty", "lown-fi", "melatonin", "mmagtech", "musicafe",
  "obodio", "practiphile", "recode", "riz", "smirk", "soundignity", "suporsalad",
  "tgx78", "therollo9", "scboy", "seanwee", "silicagel", "sl0the", "soundcheck39",
  "tanchjim", "tedthepraimortis", "treblewellxtended", "yanyin", "yoshiultra"
];

const IE_FORCE_KEYWORDS = [
  "IEM", "IN-EAR", "MONITOR", "EARPHONE", "EARBUD", "BUDS", "PODS", "TWS", "WIRELESS IEM", 
  "WF-", "IE 200", "IE 300", "IE 600", "IE 900", "CX ", "MX ", "ISINE", "LCD-I", "EUCLID", "SPHEAR", "LYRIC"
];

function isHeadphone(name, subdomain) {
  const upperName = name.toUpperCase();
  const lowerSub = subdomain.toLowerCase();
  
  let score = 0;

  // 1. Explicit OE Tags (+100)
  if (upperName.includes("(OE)") || upperName.includes("(HP)") || upperName.includes("OVER-EAR") || upperName.includes("HEADPHONE") || upperName.includes("CLOSED-BACK") || upperName.includes("OPEN-BACK")) {
    score += 100;
  }

  // 2. OE Model Registry Match (+100)
  for (const model of OE_MODEL_REGISTRY) {
    if (upperName.includes(model)) {
      score += 100;
      break;
    }
  }

  // 3. Strictly IE Brands (-200)
  for (const brand of STRICTLY_IE_BRANDS) {
    if (upperName.includes(brand)) {
      score -= 200;
      break;
    }
  }

  // 4. IE Force Keywords (-200)
  for (const kw of IE_FORCE_KEYWORDS) {
    if (upperName.includes(kw)) {
      score -= 200;
      break;
    }
  }

  // 5. Strictly IE Domains (-150)
  if (STRICTLY_IE_DOMAINS.includes(lowerSub)) {
    score -= 150;
  }

  // 6. Domain-specific hints
  if (lowerSub.includes('5128') || lowerSub.includes('headphone') || lowerSub === 'crinaclehp') {
    score += 30;
  }

  return score > 0;
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
  const s = subdomain.toLowerCase();

  // 1. Explicit Domain Mapping
  if (s.includes('5128')) return '5128';
  if (s === 'sai' || s === 'kuulokenurkka' || s === 'crinaclehp') return 'kb5';
  if (s === 'gadgetrytech' || s === 'listener') return 'kb6';

  // 2. Keyword Search
  if (n.includes('5128')) return '5128';
  if (n.includes('kb5') || n.includes('kb5000') || n.includes('kb5010') || n.includes('kb5011')) return 'kb5';
  if (n.includes('kb0065') || n.includes('kb0066') || n.includes('kb006x') || n.includes('kb6')) return 'kb6';
  
  // Default for headphones is KB5
  return 'kb5';
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
    if (group.type && group.type !== desiredType) continue;

    // Headphone Special Logic: Split Diffuse Field into 3 columns
    if (desiredType === 'headphone' && group.name === 'Diffuse Field (Tilted)') {
      const pinnae = ['kb5', 'kb6', '5128'];
      const labels = ['KB5', 'KB6', '5128'];

      for (let i = 0; i < pinnae.length; i++) {
        const p = pinnae[i];
        const label = labels[i];
        const targetData = group.variants[p];
        if (!targetData) continue;

        console.log(`Calculating PPI for: ${label} ${group.name}`);
        
        const scored = phones
          .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
          .filter(phone => phone.type === 'headphone')
          .filter(phone => phone.pinna === p)
          .map(phone => {
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
              type: phone.type,
              rig: phone.pinna === '5128' ? '5128' : '711',
              targetVariant: p,
              pinna: phone.pinna
            };
          })
          .sort((a, b) => b.similarity - a.similarity);

        results.push({ 
          targetName: `${label} ${group.name}`,
          targetFiles: { [p]: targetData.fileName },
          scoringMethod: 'ppi', 
          ranked: scored 
        });
      }
      continue;
    }

    // Standard logic for others
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
            
            if (is5128Rig) {
                targetVariant = group.variants['5128'] ? '5128' : '711';
                targetData = group.variants[targetVariant];
            } else {
                targetVariant = group.variants['711'] ? '711' : '5128';
                targetData = group.variants[targetVariant];
            }
        } else {
            targetVariant = phone.pinna;
            targetData = group.variants[targetVariant] || group.variants['default'];
        }

        if (!targetData) return null;
        
        const ppiResult = calculatePPI(phone.frequencyData, targetData.curve);
        const is5128Rig = phone.pinna === '5128' || RIG_5128_DOMAINS.includes(phone.subdomain);

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
          type: phone.type,
          rig: is5128Rig ? '5128' : '711',
          targetVariant: targetVariant,
          pinna: phone.pinna
        };
      })
      .filter(x => x !== null)
      .sort((a, b) => b.similarity - a.similarity);
    
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
  
  const domainsToScan = SUBDOMAINS;
  
  console.log(`Scanning ${domainsToScan.length} domains...\n`);
  
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
      // Store dB values and metadata
      // Using short keys to save space in the JSON file
      curveData.curves[id] = {
        d: aligned.db.map(v => Math.round(v * 100) / 100),
        t: phone.type === 'headphone' ? 1 : 0, // 0: iem, 1: headphone
        q: phone.quality === 'high' ? 1 : 0,
        p: phone.price,
        n: phone.pinna
      };
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
