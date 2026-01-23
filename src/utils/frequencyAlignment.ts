import type { FrequencyCurve, R40Curve } from '../types';

const R40_FREQUENCIES: number[] = [];

function generateR40Frequencies(): number[] {
  if (R40_FREQUENCIES.length > 0) {
    return R40_FREQUENCIES;
  }

  const startFreq = 20;
  const endFreq = 20000;
  let current = startFreq;

  while (current <= endFreq) {
    R40_FREQUENCIES.push(current);
    current = current * Math.pow(2, 1 / 12);
  }

  return R40_FREQUENCIES;
}

function interpolate(freqs: number[], dbs: number[], targetFreq: number): number {
  if (freqs.length === 0 || dbs.length === 0) {
    return 0;
  }

  if (targetFreq <= freqs[0]) {
    return dbs[0];
  }

  if (targetFreq >= freqs[freqs.length - 1]) {
    return dbs[dbs.length - 1];
  }

  for (let i = 0; i < freqs.length - 1; i++) {
    if (targetFreq >= freqs[i] && targetFreq < freqs[i + 1]) {
      const x1 = freqs[i];
      const x2 = freqs[i + 1];
      const y1 = dbs[i];
      const y2 = dbs[i + 1];

      return y1 + ((targetFreq - x1) / (x2 - x1)) * (y2 - y1);
    }
  }

  return 0;
}

function alignToR40(frequencyCurve: FrequencyCurve): R40Curve {
  const r40Frequencies = generateR40Frequencies();

  const alignedDb = r40Frequencies.map(targetFreq =>
    interpolate(frequencyCurve.frequencies, frequencyCurve.db, targetFreq)
  );

  return { frequencies: r40Frequencies, db: alignedDb };
}

export { generateR40Frequencies, alignToR40 };
