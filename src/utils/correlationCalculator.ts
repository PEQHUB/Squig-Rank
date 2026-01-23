import { FREQUENCY_BANDS } from '../config/weighting';
import type { R40Curve } from '../types';

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = mean(x);
  const meanY = mean(y);

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);

  if (denominator === 0) return 0;

  return numerator / denominator;
}

function extractBand(curve: R40Curve, minFreq: number, maxFreq: number): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];

  for (let i = 0; i < curve.frequencies.length; i++) {
    const freq = curve.frequencies[i];
    if (freq >= minFreq && freq < maxFreq) {
      x.push(curve.frequencies[i]);
      y.push(curve.db[i]);
    }
  }

  return { x, y };
}

function calculateSimilarity(iem: R40Curve, target: R40Curve): number {
  let weightedSum = 0;

  FREQUENCY_BANDS.forEach(band => {
    const iemBand = extractBand(iem, band.min, band.max);
    const targetBand = extractBand(target, band.min, band.max);

    const correlation = pearsonCorrelation(iemBand.y, targetBand.y);

    weightedSum += correlation * band.weight;
  });

  return weightedSum * 100;
}

export { calculateSimilarity };
