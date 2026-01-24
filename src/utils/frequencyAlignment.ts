import type { FrequencyCurve, R40Curve } from '../types';

// R40 frequencies: 1/12 octave spacing from 20Hz to 20kHz
// Pre-computed for efficiency
const R40_FREQUENCIES: number[] = generateR40Frequencies();

/**
 * Generate R40 frequency points (1/12 octave spacing)
 */
function generateR40Frequencies(): number[] {
  const frequencies: number[] = [];
  const startFreq = 20;
  const endFreq = 20000;
  
  let current = startFreq;
  while (current <= endFreq) {
    frequencies.push(Math.round(current * 100) / 100); // Round to 2 decimal places
    current = current * Math.pow(2, 1 / 12);
  }
  
  return frequencies;
}

/**
 * Get the pre-computed R40 frequencies
 */
function getR40Frequencies(): number[] {
  return R40_FREQUENCIES;
}

/**
 * Logarithmic interpolation (better for frequency domain)
 */
function logInterpolate(
  freqs: number[], 
  dbs: number[], 
  targetFreq: number
): number {
  if (freqs.length === 0 || dbs.length === 0) {
    return 0;
  }
  
  // Handle edge cases
  if (targetFreq <= freqs[0]) {
    return dbs[0];
  }
  
  if (targetFreq >= freqs[freqs.length - 1]) {
    return dbs[dbs.length - 1];
  }
  
  // Binary search for the surrounding points
  let low = 0;
  let high = freqs.length - 1;
  
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (freqs[mid] <= targetFreq) {
      low = mid;
    } else {
      high = mid;
    }
  }
  
  // Linear interpolation in log-frequency domain
  const logF1 = Math.log10(freqs[low]);
  const logF2 = Math.log10(freqs[high]);
  const logTarget = Math.log10(targetFreq);
  
  const t = (logTarget - logF1) / (logF2 - logF1);
  return dbs[low] + t * (dbs[high] - dbs[low]);
}

/**
 * Align a frequency curve to R40 standard frequencies
 */
function alignToR40(curve: FrequencyCurve): R40Curve {
  if (curve.frequencies.length === 0 || curve.db.length === 0) {
    return { 
      frequencies: [...R40_FREQUENCIES], 
      db: R40_FREQUENCIES.map(() => 0) 
    };
  }
  
  const alignedDb = R40_FREQUENCIES.map(targetFreq =>
    logInterpolate(curve.frequencies, curve.db, targetFreq)
  );
  
  return { 
    frequencies: [...R40_FREQUENCIES], 
    db: alignedDb 
  };
}

/**
 * Normalize a curve to a reference point (default: 1kHz = 0dB)
 */
function normalizeCurve(curve: R40Curve, refFreq: number = 1000): R40Curve {
  const refDb = logInterpolate(curve.frequencies, curve.db, refFreq);
  
  return {
    frequencies: [...curve.frequencies],
    db: curve.db.map(db => db - refDb),
  };
}

export { 
  generateR40Frequencies, 
  getR40Frequencies, 
  alignToR40, 
  normalizeCurve,
  logInterpolate 
};
