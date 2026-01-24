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

// Domains that use B&K 5128 measurement rig (vs standard 711)
// These need compensation when comparing to 711-based targets
const RIG_5128_DOMAINS = ["earphonesarchive", "sai"];

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
    
    // Support multiple separators: whitespace, tab, semicolon, comma
    const parts = line.trim().split(/[\s\t;,]+/);
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

// ============================================================================
// SIMILARITY CALCULATION - RMS Deviation Based
// ============================================================================

// Attempt at frequency weighting using preferred-perceived-index style weighting:
// - Bass (20-200Hz): Deviations matter but less critical for "accuracy"
// - Lower mids (200-1kHz): Important for tonality
// - Upper mids (1k-4kHz): Most critical - ear canal resonance region
// - Presence (4k-8kHz): Important for clarity
// - Treble (8k-20kHz): Less critical, high variability in measurements

function getFrequencyWeight(freq) {
  // Weight by perceptual importance (loosely based on ISO 226 equal-loudness)
  if (freq < 200) return 0.6;        // Sub-bass/bass - less critical
  if (freq < 1000) return 1.0;       // Lower mids - important
  if (freq < 4000) return 1.2;       // Upper mids - most critical (ear gain region)  
  if (freq < 8000) return 1.0;       // Presence - important
  return 0.5;                        // Treble - high measurement variance
}

function calculateRMSDeviation(iemCurve, targetCurve) {
  // Align both to R40 and normalize at 1kHz
  const iem = normalizeCurve(alignToR40(iemCurve));
  const target = normalizeCurve(alignToR40(targetCurve));
  
  let weightedSumSquares = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < R40_FREQUENCIES.length; i++) {
    const freq = R40_FREQUENCIES[i];
    const iemDb = iem.db[i];
    const targetDb = target.db[i];
    
    if (isNaN(iemDb) || isNaN(targetDb)) continue;
    
    const deviation = iemDb - targetDb;
    const weight = getFrequencyWeight(freq);
    
    weightedSumSquares += (deviation * deviation) * weight;
    totalWeight += weight;
  }
  
  if (totalWeight === 0) return Infinity;
  
  // Weighted RMS in dB
  return Math.sqrt(weightedSumSquares / totalWeight);
}

function calculateSimilarity(iemCurve, targetCurve) {
  const rmsDeviation = calculateRMSDeviation(iemCurve, targetCurve);
  
  // Convert RMS deviation to a 0-100 score
  // 0 dB RMS = 100 score (perfect match)
  // 10 dB RMS = 0 score (very poor match)
  // Using exponential decay for more intuitive scoring
  const score = Math.max(0, 100 * Math.exp(-rmsDeviation / 4));
  
  return score;
}

// ============================================================================
// GENERALIZED PPI SCORING (Works with ANY target curve)
// ============================================================================
// Based on the Harman IE Preference Prediction model formula:
// PPI = 100.0795 - (8.5 × STDEV) - (6.796 × |SLOPE|) - (3.475 × AVG_ERROR)
// This formula can be applied to any target curve, not just Harman.

// Standard PPI frequency points (20Hz - 20kHz, 121 points)
const PPI_FREQUENCIES = [
  20, 21.2, 22.4, 23.6, 25, 26.5, 28, 30, 31.5, 33.5, 35.5, 37.5, 40, 42.5, 45,
  47.5, 50, 53, 56, 60, 63, 67, 71, 75, 80, 85, 90, 95, 100, 106, 112, 118, 125,
  132, 140, 150, 160, 170, 180, 190, 200, 212, 224, 236, 250, 265, 280, 300, 315,
  335, 355, 375, 400, 425, 450, 475, 500, 530, 560, 600, 630, 670, 710, 750, 800,
  850, 900, 950, 1000, 1060, 1120, 1180, 1250, 1320, 1400, 1500, 1600, 1700, 1800,
  1900, 2000, 2120, 2240, 2360, 2500, 2650, 2800, 3000, 3150, 3350, 3550, 3750,
  4000, 4250, 4500, 4750, 5000, 5300, 5600, 6000, 6300, 6700, 7100, 7500, 8000,
  8500, 9000, 9500, 10000, 10600, 11200, 11800, 12500, 13200, 14000, 15000, 16000,
  17000, 18000, 19000, 20000
];

/**
 * Calculate PPI score for an IEM against ANY target curve
 * @param {Object} iemCurve - IEM frequency response {frequencies: [], db: []}
 * @param {Object} targetCurve - Target curve {frequencies: [], db: []}
 * @returns {Object} {ppi, stdev, slope, avgError}
 */
function calculatePPI(iemCurve, targetCurve) {
  // Align both curves to R40 and normalize at 1kHz
  const iemAligned = alignToR40(iemCurve);
  const iemNorm = normalizeCurve(iemAligned);
  
  const targetAligned = alignToR40(targetCurve);
  const targetNorm = normalizeCurve(targetAligned);
  
  // Calculate error at each PPI frequency point
  const errors = [];
  const absErrors = [];
  const lnFreqs = [];
  
  for (const freq of PPI_FREQUENCIES) {
    const iemDb = logInterpolate(iemNorm.frequencies, iemNorm.db, freq);
    const targetDb = logInterpolate(targetNorm.frequencies, targetNorm.db, freq);
    
    const error = iemDb - targetDb;
    
    // For STDEV and SLOPE: use 20Hz - 10kHz
    if (freq <= 10000) {
      errors.push(error);
      lnFreqs.push(Math.log(freq));
    }
    
    // For AVG_ERROR: use 40Hz - 10kHz
    if (freq >= 40 && freq <= 10000) {
      absErrors.push(Math.abs(error));
    }
  }
  
  if (errors.length === 0) {
    return { ppi: 0, stdev: 0, slope: 0, avgError: 0 };
  }
  
  // Calculate STDEV of error
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const variance = errors.reduce((a, e) => a + (e - meanError) ** 2, 0) / errors.length;
  const stdev = Math.sqrt(variance);
  
  // Calculate SLOPE of error vs ln(frequency)
  const meanLnFreq = lnFreqs.reduce((a, b) => a + b, 0) / lnFreqs.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < errors.length; i++) {
    numerator += (lnFreqs[i] - meanLnFreq) * (errors[i] - meanError);
    denominator += (lnFreqs[i] - meanLnFreq) ** 2;
  }
  const slope = denominator !== 0 ? numerator / denominator : 0;
  
  // Calculate AVG of absolute error
  const avgError = absErrors.length > 0 
    ? absErrors.reduce((a, b) => a + b, 0) / absErrors.length 
    : 0;
  
  // PPI formula (same as Harman)
  const ppi = 100.0795 - (8.5 * stdev) - (6.796 * Math.abs(slope)) - (3.475 * avgError);
  
  return {
    ppi: Math.max(0, Math.min(100, ppi)),
    stdev,
    slope,
    avgError
  };
}

// ============================================================================
// HARMAN 2019 IE PPI SCORING (Legacy - kept for reference)
// ============================================================================
// Based on the Harman IE Preference Prediction model
// Formula: PPI = 100.0795 - (8.5 × STDEV) - (6.796 × |SLOPE|) - (3.475 × AVG_ERROR)
// Where:
// - STDEV = Standard deviation of error curve (20Hz - 10kHz)
// - SLOPE = Slope of error vs ln(frequency) (20Hz - 10kHz)  
// - AVG_ERROR = Average of |error| (40Hz - 10kHz)

// Harman IE Target frequencies (specific frequencies from PPI template)
const HARMAN_IE_FREQUENCIES = [
  20, 21.2, 22.4, 23.6, 25, 26.5, 28, 30, 31.5, 33.5, 35.5, 37.5, 40, 42.5, 45,
  47.5, 50, 53, 56, 60, 63, 67, 71, 75, 80, 85, 90, 95, 100, 106, 112, 118, 125,
  132, 140, 150, 160, 170, 180, 190, 200, 212, 224, 236, 250, 265, 280, 300, 315,
  335, 355, 375, 400, 425, 450, 475, 500, 530, 560, 600, 630, 670, 710, 750, 800,
  850, 900, 950, 1000, 1060, 1120, 1180, 1250, 1320, 1400, 1500, 1600, 1700, 1800,
  1900, 2000, 2120, 2240, 2360, 2500, 2650, 2800, 3000, 3150, 3350, 3550, 3750,
  4000, 4250, 4500, 4750, 5000, 5300, 5600, 6000, 6300, 6700, 7100, 7500, 8000,
  8500, 9000, 9500, 10000, 10600, 11200, 11800, 12500, 13200, 14000, 15000, 16000,
  17000, 18000, 19000, 20000
];

// Harman IE 2019 Target curve (dB values at each frequency)
const HARMAN_IE_TARGET = [
  9.0131, 9.0574, 9.0925, 9.1138, 9.1229, 9.1243, 9.1220, 9.1162, 9.1027, 9.0737,
  9.0209, 8.9380, 8.8221, 8.6739, 8.4960, 8.2917, 8.0634, 7.8127, 7.5410, 7.2494,
  6.9399, 6.6154, 6.2796, 5.9366, 5.5905, 5.2442, 4.8992, 4.5558, 4.2132, 3.8712,
  3.5296, 3.1884, 2.8476, 2.5074, 2.1682, 1.8307, 1.4958, 1.1655, 0.8426, 0.5305,
  0.2330, -0.0447, -0.2969, -0.5175, -0.6988, -0.8329, -0.9133, -0.9355, -0.8968,
  -0.7972, -0.6404, -0.4336, -0.1844, 0.0930, 0.3831, 0.6679, 0.9313, 1.1623,
  1.3553, 1.4042, 1.6222, 1.8785, 2.1813, 2.5368, 2.949, 3.4191, 3.946, 4.5256,
  5.1519, 5.8159, 6.5059, 7.2066, 7.8993, 8.5628, 9.1742, 9.7115, 10.1556, 10.4921,
  10.7132, 10.818, 10.8131, 10.7111, 10.5297, 10.2897, 10.0123, 9.7167, 9.4175,
  9.1218, 8.8272, 8.521, 8.1805, 7.7753, 7.273, 6.647, 5.8841, 4.9893, 3.9849,
  2.9024, 1.7726, 0.6179, -0.5476, -1.7116, -2.8574, -3.9671, -5.0394, -6.1164,
  -7.3037, -8.7631, -10.6662, -13.1173, -16.08, -19.354
];

function interpolateHarmanTarget(freq) {
  if (freq <= HARMAN_IE_FREQUENCIES[0]) return HARMAN_IE_TARGET[0];
  if (freq >= HARMAN_IE_FREQUENCIES[HARMAN_IE_FREQUENCIES.length - 1]) {
    return HARMAN_IE_TARGET[HARMAN_IE_TARGET.length - 1];
  }
  
  // Find surrounding points
  let low = 0;
  for (let i = 0; i < HARMAN_IE_FREQUENCIES.length - 1; i++) {
    if (HARMAN_IE_FREQUENCIES[i] <= freq && HARMAN_IE_FREQUENCIES[i + 1] >= freq) {
      low = i;
      break;
    }
  }
  
  const f1 = HARMAN_IE_FREQUENCIES[low];
  const f2 = HARMAN_IE_FREQUENCIES[low + 1];
  const db1 = HARMAN_IE_TARGET[low];
  const db2 = HARMAN_IE_TARGET[low + 1];
  
  // Log interpolation
  const t = (Math.log(freq) - Math.log(f1)) / (Math.log(f2) - Math.log(f1));
  return db1 + t * (db2 - db1);
}

function calculateHarmanPPI(iemCurve) {
  // Align IEM to Harman frequencies and normalize at 1kHz
  const iemAligned = alignToR40(iemCurve);
  const iemNorm = normalizeCurve(iemAligned);
  
  // Calculate error at each Harman frequency point
  const errors = [];
  const absErrors = [];
  const freqsForSlope = [];
  const lnFreqs = [];
  
  for (const freq of HARMAN_IE_FREQUENCIES) {
    const iemDb = logInterpolate(iemNorm.frequencies, iemNorm.db, freq);
    const targetDb = interpolateHarmanTarget(freq);
    // Normalize target at 1kHz too
    const target1k = interpolateHarmanTarget(1000);
    const normalizedTargetDb = targetDb - target1k;
    
    const error = iemDb - normalizedTargetDb;
    
    // For STDEV and SLOPE: use 20Hz - 10kHz (all freqs up to 10kHz)
    if (freq <= 10000) {
      errors.push(error);
      freqsForSlope.push(freq);
      lnFreqs.push(Math.log(freq));
    }
    
    // For AVG_ERROR: use 40Hz - 10kHz
    if (freq >= 40 && freq <= 10000) {
      absErrors.push(Math.abs(error));
    }
  }
  
  // Calculate STDEV of error
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const variance = errors.reduce((a, e) => a + (e - meanError) ** 2, 0) / errors.length;
  const stdev = Math.sqrt(variance);
  
  // Calculate SLOPE of error vs ln(frequency)
  // Using linear regression: slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
  const meanLnFreq = lnFreqs.reduce((a, b) => a + b, 0) / lnFreqs.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < errors.length; i++) {
    numerator += (lnFreqs[i] - meanLnFreq) * (errors[i] - meanError);
    denominator += (lnFreqs[i] - meanLnFreq) ** 2;
  }
  const slope = denominator !== 0 ? numerator / denominator : 0;
  
  // Calculate AVG of absolute error
  const avgError = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
  
  // Harman PPI formula
  const ppi = 100.0795 - (8.5 * stdev) - (6.796 * Math.abs(slope)) - (3.475 * avgError);
  
  return {
    ppi: Math.max(0, Math.min(100, ppi)), // Clamp to 0-100
    stdev,
    slope,
    avgError
  };
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
// TARGET LOADING & COMPENSATION
// ============================================================================

let compensation5128 = null;

function loadCompensation() {
  // Try multiple locations for compensation file
  const candidates = [
    path.join(__dirname, '..', 'compensation', '5128comp.txt'),
    path.join(TARGETS_DIR, '5128comp.txt')
  ];
  
  for (const compPath of candidates) {
    if (fs.existsSync(compPath)) {
      try {
        const text = fs.readFileSync(compPath, 'utf-8');
        // Parse using semi-colon separator if needed (based on file content I saw)
        // parseFrequencyResponse handles standard formats, but let's ensure it handles ';'
        // The existing parser splits by /[\s\t;,]+/, so it should work.
        compensation5128 = parseFrequencyResponse(text);
        console.log(`Loaded 5128 compensation curve from ${compPath}`);
        return;
      } catch (e) {
        console.warn(`Failed to parse compensation file: ${e.message}`);
      }
    }
  }
  
  console.warn('Warning: 5128 compensation file not found');
}

/**
 * Generate a target variant by applying compensation
 * mode: 'add' (711 -> 5128 if comp is positive delta? No, wait.)
 * Compensation file 5128comp.txt:
 * Values are around -0.2 to +4.0. 
 * Assumption: 5128 = 711 - Compensation (because 5128 has less ear gain, comp is positive in ear gain region).
 * So:
 * 711 -> 5128: Subtract compensation
 * 5128 -> 711: Add compensation
 */
function generateVariant(curve, mode) {
  if (!compensation5128 || !curve) return null;
  
  const newDb = curve.frequencies.map((f, i) => {
    // Interpolate compensation at this frequency
    const compDb = logInterpolate(compensation5128.frequencies, compensation5128.db, f);
    if (mode === 'add') return curve.db[i] + compDb;
    if (mode === 'subtract') return curve.db[i] - compDb;
    return curve.db[i];
  });
  
  return { frequencies: [...curve.frequencies], db: newDb };
}

function loadTargets() {
  loadCompensation();
  
  const targetGroups = new Map(); // name -> { name, 711: {curve, fileName, generated}, 5128: {curve, fileName, generated} }
  
  // Load all .txt files from targets directory
  if (!fs.existsSync(TARGETS_DIR)) return [];
  
  const targetFiles = fs.readdirSync(TARGETS_DIR).filter(f => f.endsWith('.txt') && !f.includes('5128comp'));
  
  for (const fileName of targetFiles) {
    const filePath = path.join(TARGETS_DIR, fileName);
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const curve = parseFrequencyResponse(text);
      
      if (curve.frequencies.length >= 10) {
        const is5128 = fileName.toLowerCase().includes('5128');
        // Base name: remove " (5128)" and ".txt"
        const baseName = fileName.replace(/\s*\(5128\)/i, '').replace('.txt', '').trim();
        
        if (!targetGroups.has(baseName)) {
          targetGroups.set(baseName, { name: baseName, '711': null, '5128': null });
        }
        
        const group = targetGroups.get(baseName);
        const type = is5128 ? '5128' : '711';
        
        group[type] = {
          fileName: fileName,
          curve: curve,
          generated: false
        };
        
        console.log(`  Loaded target: ${fileName} [${type}] -> Group: ${baseName}`);
      }
    } catch (e) {
      console.warn(`  Failed to load target: ${fileName}`);
    }
  }
  
  // Generate missing variants
  if (compensation5128) {
    for (const group of targetGroups.values()) {
      if (group['711'] && !group['5128']) {
        console.log(`  Generating 5128 variant for ${group.name}`);
        group['5128'] = {
          fileName: `${group.name} (5128).txt`, // Virtual filename
          curve: generateVariant(group['711'].curve, 'subtract'),
          generated: true
        };
      } else if (!group['711'] && group['5128']) {
        console.log(`  Generating 711 variant for ${group.name}`);
        group['711'] = {
          fileName: `${group.name}.txt`, // Virtual filename
          curve: generateVariant(group['5128'].curve, 'add'),
          generated: true
        };
      }
    }
  }
  
  return Array.from(targetGroups.values());
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
  
  for (const group of targetsGlobal) {
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => {
        const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain);
        
        // Select appropriate target
        // If is5128Rig and we have a 5128 target, use it. Otherwise use 711.
        // If it's a 711 rig, use 711 target.
        let targetVariant = '711';
        let targetData = group['711'];
        
        if (is5128Rig && group['5128']) {
          targetVariant = '5128';
          targetData = group['5128'];
        } else if (!targetData && group['5128']) {
           // Fallback if we only have 5128 target but 711 IEM (unlikely but safe)
           targetVariant = '5128';
           targetData = group['5128'];
        }

        if (!targetData) return null;

        // Use generalized PPI formula
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
    
    scored.sort((a, b) => b.similarity - a.similarity);
    
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
  console.log(`Loaded ${targets.length} target groups`);
  
  console.log('');
  
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
  
  // Calculate PPI scores for each target (using generalized PPI formula for ALL targets)
  const results = [];
  
  for (const group of targets) {
    console.log(`Calculating PPI for: ${group.name}`);
    
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => {
        // Check if this IEM is from a 5128 rig
        const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain);
        
        // Select appropriate target
        let targetVariant = '711';
        let targetData = group['711'];
        
        if (is5128Rig && group['5128']) {
          targetVariant = '5128';
          targetData = group['5128'];
        } else if (!targetData && group['5128']) {
           // Fallback
           targetVariant = '5128';
           targetData = group['5128'];
        }

        if (!targetData) return null;
        
        // Use generalized PPI formula
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
    
    // Sort by PPI (desc), then price (asc)
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
  }
  
  const uniquePhones = Array.from(seen.values());
  const results = [];
  
  for (const target of targetsGlobal) {
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => {
        const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain);
        const curveToUse = (is5128Rig && compensation5128to711) 
          ? apply5128Compensation(phone.frequencyData) 
          : phone.frequencyData;
        
        // Use generalized PPI for ALL targets
        const ppiResult = calculatePPI(curveToUse, target.curve);
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
          rig: is5128Rig ? '5128' : '711'
        };
      });
    
    scored.sort((a, b) => b.similarity - a.similarity);
    results.push({ 
      targetName: target.name, 
      targetFileName: target.fileName,
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
  console.log(`Loaded ${targets.length} target groups`);
  
  console.log('');
  
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
  
  // Calculate PPI scores for each target (using generalized PPI formula for ALL targets)
  const results = [];
  
  for (const group of targets) {
    console.log(`Calculating PPI for: ${group.name}`);
    
    const scored = uniquePhones
      .filter(phone => phone.frequencyData && phone.frequencyData.frequencies.length >= 10)
      .map(phone => {
        // Check if this IEM is from a 5128 rig
        const is5128Rig = RIG_5128_DOMAINS.includes(phone.subdomain);
        
        // Select appropriate target
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
        
        // Use generalized PPI formula
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
    
    // Sort by PPI (desc), then price (asc)
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
