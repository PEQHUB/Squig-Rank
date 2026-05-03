/**
 * Client-side PPI calculation utilities
 * Uses the same algorithm as the backend scanner
 */

import type { FrequencyCurve } from '../types';
import { findLoudnessOffset, loudnessWeightedCenter } from './loudnessNorm';

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

// R40 frequencies for alignment
function generateR40Frequencies(): number[] {
  const frequencies: number[] = [];
  let current = 20;
  while (current <= 20000) {
    frequencies.push(Math.round(current * 100) / 100);
    current = current * Math.pow(2, 1 / 12);
  }
  return frequencies;
}

const R40_FREQUENCIES = generateR40Frequencies();

export function logInterpolate(freqs: number[], dbs: number[], targetFreq: number): number {
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

function alignToR40(curve: FrequencyCurve): FrequencyCurve {
  if (!curve.frequencies.length) {
    return { frequencies: [...R40_FREQUENCIES], db: R40_FREQUENCIES.map(() => 0) };
  }
  const alignedDb = R40_FREQUENCIES.map(f => logInterpolate(curve.frequencies, curve.db, f));
  return { frequencies: [...R40_FREQUENCIES], db: alignedDb };
}

export interface PPIResult {
  ppi: number;
  stdev: number;
  slope: number;
  avgError: number;
}

/**
 * Arbitrary SPL reference added to relative dB data before loudness normalization.
 * ISO 226 loudness computation needs absolute SPL values to produce meaningful
 * phon values. Since IEM and target data in SquigRank is in relative dB
 * (centered near 0), we add this reference before level-matching, then the
 * centering step removes it. The exact value doesn't affect PPI — only the
 * relative shape matters.
 */
const SPL_REFERENCE = 70;

/**
 * Calculate PPI score for an IEM against any target curve
 */
export function calculatePPI(iemCurve: FrequencyCurve, targetCurve: FrequencyCurve, bandMin: number = 20, bandMax: number = 10000): PPIResult {
  // Align both curves to R40, level-match to same perceived loudness (60 phon),
  // then center at 0 dB using the loudness-weighted average (not 1 kHz).
  // This makes the PPI error reflect shape mismatch only, and is robust
  // against localized dips/peaks at any single frequency.
  const iemAligned = alignToR40(iemCurve);
  const targetAligned = alignToR40(targetCurve);

  // Convert relative dB to absolute SPL by adding reference level.
  // This is needed for ISO 226 phon computation. The reference cancels
  // out in the final error calculation after centering.
  const iemSPL = iemAligned.db.map(d => d + SPL_REFERENCE);
  const targetSPL = targetAligned.db.map(d => d + SPL_REFERENCE);

  // Level-match: add offsets so both curves have 60 phon perceived loudness
  const iemOffset = findLoudnessOffset(iemAligned.frequencies, iemSPL, 60);
  const targetOffset = findLoudnessOffset(targetAligned.frequencies, targetSPL, 60);

  const iemLevelMatched: FrequencyCurve = {
    frequencies: iemAligned.frequencies,
    db: iemSPL.map(d => d + iemOffset)
  };
  const targetLevelMatched: FrequencyCurve = {
    frequencies: targetAligned.frequencies,
    db: targetSPL.map(d => d + targetOffset)
  };

  // Center at 0 dB using loudness-weighted average (not 1 kHz)
  const iemCenter = loudnessWeightedCenter(iemLevelMatched.frequencies, iemLevelMatched.db);
  const targetCenter = loudnessWeightedCenter(targetLevelMatched.frequencies, targetLevelMatched.db);

  const iemNorm: FrequencyCurve = {
    frequencies: iemLevelMatched.frequencies,
    db: iemLevelMatched.db.map(d => d - iemCenter)
  };
  const targetNorm: FrequencyCurve = {
    frequencies: targetLevelMatched.frequencies,
    db: targetLevelMatched.db.map(d => d - targetCenter)
  };
  
  // Calculate error at each PPI frequency point
  const errors: number[] = [];
  const absErrors: number[] = [];
  const lnFreqs: number[] = [];
  
  for (const freq of PPI_FREQUENCIES) {
    const iemDb = logInterpolate(iemNorm.frequencies, iemNorm.db, freq);
    const targetDb = logInterpolate(targetNorm.frequencies, targetNorm.db, freq);

    const error = iemDb - targetDb;

    // For STDEV and SLOPE: use [bandMin, bandMax]
    if (freq >= bandMin && freq <= bandMax) {
      errors.push(error);
      lnFreqs.push(Math.log(freq));
    }

    // For AVG_ERROR: use 40Hz floor when bandMin is at or below 40Hz,
    // matching the original PPI spec. If user narrows above 40Hz, respect that.
    const avgErrorMin = bandMin <= 40 ? 40 : bandMin;
    if (freq >= avgErrorMin && freq <= bandMax) {
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

/**
 * Parse frequency response text file
 */
export function parseFrequencyResponse(text: string): FrequencyCurve {
  const frequencies: number[] = [];
  const db: number[] = [];
  
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
