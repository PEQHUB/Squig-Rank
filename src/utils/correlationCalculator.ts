import { FREQUENCY_BANDS } from '../config/weighting';
import type { R40Curve } from '../types';

/**
 * Calculate mean of an array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 * Returns a value between -1 and 1
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  // Use only the overlapping portion
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);
  
  const meanX = mean(xSlice);
  const meanY = mean(ySlice);
  
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  const denominator = Math.sqrt(denomX * denomY);
  
  if (denominator === 0) return 0;
  
  return numerator / denominator;
}

/**
 * Extract frequency band from R40 curve
 */
function extractBand(
  curve: R40Curve, 
  minFreq: number, 
  maxFreq: number
): number[] {
  const values: number[] = [];
  
  for (let i = 0; i < curve.frequencies.length; i++) {
    const freq = curve.frequencies[i];
    if (freq >= minFreq && freq < maxFreq) {
      values.push(curve.db[i]);
    }
  }
  
  return values;
}

/**
 * Calculate weighted similarity score between an IEM and target curve
 * Both curves must be aligned to R40 frequencies
 * Returns a value from -100 to 100 (negative means anti-correlated)
 */
function calculateSimilarity(iem: R40Curve, target: R40Curve): number {
  if (iem.frequencies.length === 0 || target.frequencies.length === 0) {
    return 0;
  }
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const band of FREQUENCY_BANDS) {
    const iemBand = extractBand(iem, band.min, band.max);
    const targetBand = extractBand(target, band.min, band.max);
    
    // Skip bands with insufficient data
    if (iemBand.length < 3 || targetBand.length < 3) {
      continue;
    }
    
    const correlation = pearsonCorrelation(iemBand, targetBand);
    
    weightedSum += correlation * band.weight;
    totalWeight += band.weight;
  }
  
  // Normalize by total weight used (in case some bands were skipped)
  if (totalWeight === 0) return 0;
  
  return (weightedSum / totalWeight) * 100;
}

/**
 * Calculate RMS difference between two curves (alternative to correlation)
 * Lower is better, returns difference in dB
 */
function calculateRMSDifference(iem: R40Curve, target: R40Curve): number {
  const n = Math.min(iem.db.length, target.db.length);
  if (n === 0) return Infinity;
  
  let sumSquared = 0;
  for (let i = 0; i < n; i++) {
    const diff = iem.db[i] - target.db[i];
    sumSquared += diff * diff;
  }
  
  return Math.sqrt(sumSquared / n);
}

export { 
  calculateSimilarity, 
  calculateRMSDifference, 
  pearsonCorrelation,
  extractBand 
};
