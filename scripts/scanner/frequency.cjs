/**
 * Frequency Response Utilities
 * Parsing, interpolation, and alignment functions
 */

// ============================================================================
// R40 FREQUENCY GRID
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

// PPI frequency points (20Hz - 20kHz, 121 points)
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

// ============================================================================
// PARSING
// ============================================================================

/**
 * Parse frequency response text file
 * Supports multiple formats: space/tab/comma/semicolon separated
 */
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
// INTERPOLATION
// ============================================================================

/**
 * Logarithmic interpolation for frequency response data
 * Uses binary search for efficiency
 */
function logInterpolate(freqs, dbs, targetFreq) {
  if (freqs.length === 0 || dbs.length === 0) return 0;
  if (targetFreq <= freqs[0]) return dbs[0];
  if (targetFreq >= freqs[freqs.length - 1]) return dbs[dbs.length - 1];
  
  // Binary search
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

// ============================================================================
// ALIGNMENT & NORMALIZATION
// ============================================================================

/**
 * Align curve to R40 frequency grid
 */
function alignToR40(curve) {
  if (!curve.frequencies.length) {
    return { frequencies: [...R40_FREQUENCIES], db: R40_FREQUENCIES.map(() => 0) };
  }
  const alignedDb = R40_FREQUENCIES.map(f => logInterpolate(curve.frequencies, curve.db, f));
  return { frequencies: [...R40_FREQUENCIES], db: alignedDb };
}

/**
 * Normalize curve to reference frequency (default 1kHz)
 */
function normalizeCurve(curve, refFreq = 1000) {
  const refDb = logInterpolate(curve.frequencies, curve.db, refFreq);
  return {
    frequencies: [...curve.frequencies],
    db: curve.db.map(d => d - refDb)
  };
}

/**
 * Average two curves (for L/R channel averaging)
 */
function averageCurves(curveA, curveB) {
  if (!curveA || !curveA.frequencies.length) return curveB;
  if (!curveB || !curveB.frequencies.length) return curveA;

  const avgDb = curveA.frequencies.map((freq, i) => {
    const dbA = curveA.db[i];
    const dbB = logInterpolate(curveB.frequencies, curveB.db, freq);
    return (dbA + dbB) / 2;
  });

  return {
    frequencies: [...curveA.frequencies],
    db: avgDb
  };
}

// ============================================================================
// PPI CALCULATION
// ============================================================================

/**
 * Calculate PPI score for an IEM against any target curve
 * Based on the Harman IE Preference Prediction model formula:
 * PPI = 100.0795 - (8.5 * STDEV) - (6.796 * |SLOPE|) - (3.475 * AVG_ERROR)
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
  
  // PPI formula
  const ppi = 100.0795 - (8.5 * stdev) - (6.796 * Math.abs(slope)) - (3.475 * avgError);
  
  return {
    ppi: Math.max(0, Math.min(100, ppi)),
    stdev,
    slope,
    avgError
  };
}

module.exports = {
  R40_FREQUENCIES,
  PPI_FREQUENCIES,
  parseFrequencyResponse,
  logInterpolate,
  alignToR40,
  normalizeCurve,
  averageCurves,
  calculatePPI
};
