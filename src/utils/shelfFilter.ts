/**
 * Shelf Filter Math for DF Target Builder
 *
 * Pure functions for computing tilt, bass shelf, and treble shelf
 * magnitude responses. Used to modify untilted DF baseline curves.
 *
 * Reference: listener800.github.io/eqplayground.html
 * Filter model: Analog 2nd-order shelf (evaluated on jω axis)
 */

import type { FrequencyCurve } from '../types';

// ============================================================================
// TYPES & DEFAULTS
// ============================================================================

export interface BuilderParams {
  tilt: number;       // dB/octave (e.g. -0.8)
  bassGain: number;   // dB for low shelf at 105 Hz
  trebleGain: number; // dB for high shelf at 2500 Hz
}

export const DEFAULT_PARAMS: BuilderParams = {
  tilt: -0.8,
  bassGain: 3,
  trebleGain: 0,
};

/** Per-category defaults: IEMs get bass shelf, headphones get tilt only */
export const CATEGORY_DEFAULTS: Record<string, BuilderParams> = {
  iem:      { tilt: -0.8, bassGain: 3, trebleGain: 0 },
  hp_kb5:   { tilt: -0.8, bassGain: 0, trebleGain: 0 },
  hp_5128:  { tilt: -0.8, bassGain: 0, trebleGain: 0 },
  iem_5128: { tilt: -0.8, bassGain: 3, trebleGain: 0 },
};

// ============================================================================
// FILTER FUNCTIONS
// ============================================================================

/**
 * Compute tilt in dB at a given frequency.
 * Linear slope in dB/octave, with 0 dB at the reference frequency.
 *
 * @param freq - Frequency in Hz
 * @param slopeDbPerOctave - Slope in dB per octave (negative = downward tilt)
 * @param refFreq - Reference frequency where tilt = 0 dB (default: 1000 Hz)
 */
export function computeTilt(freq: number, slopeDbPerOctave: number, refFreq: number = 1000): number {
  if (slopeDbPerOctave === 0) return 0;
  return slopeDbPerOctave * Math.log2(freq / refFreq);
}

/**
 * Compute the magnitude response (in dB) of a 2nd-order analog low shelf filter.
 *
 * Uses the analog prototype transfer function evaluated on the jω axis:
 *   H(s) = A * [s² + (√A/Q)s + A] / [As² + (√A/Q)s + 1]
 *
 * Squared magnitude at normalized frequency w = freq/fc:
 *   |H|² = A² × [(A-w²)² + (w·√A/Q)²] / [(1-A·w²)² + (w·√A/Q)²]
 *
 * @param freq - Frequency in Hz
 * @param fc - Center/corner frequency in Hz (default: 105)
 * @param gainDb - Gain in dB (positive = boost, negative = cut)
 * @param Q - Quality factor (default: 0.7071 = Butterworth)
 */
export function computeLowShelfMagnitude(
  freq: number,
  fc: number = 105,
  gainDb: number,
  Q: number = 0.7071
): number {
  if (gainDb === 0) return 0;

  const A = Math.pow(10, gainDb / 40);  // A = 10^(G/40), square root of linear gain
  const w = freq / fc;                   // normalized frequency
  const w2 = w * w;
  const A2 = A * A;
  const sqrtA_Q = Math.sqrt(A) / Q;
  const sqrtA_Q2 = sqrtA_Q * sqrtA_Q;

  // Numerator: A² × [(A - w²)² + (w·√A/Q)²]
  const num = A2 * ((A - w2) * (A - w2) + w2 * sqrtA_Q2);
  // Denominator: (1 - A·w²)² + (w·√A/Q)²
  const den = (1 - A * w2) * (1 - A * w2) + w2 * sqrtA_Q2;

  if (den === 0) return 0;
  return 10 * Math.log10(num / den);
}

/**
 * Compute the magnitude response (in dB) of a 2nd-order analog high shelf filter.
 *
 * The high shelf is the spectral mirror of the low shelf around the center frequency.
 * Achieved by evaluating the low shelf at the inverted frequency: fc²/freq.
 *
 * @param freq - Frequency in Hz
 * @param fc - Center/corner frequency in Hz (default: 2500)
 * @param gainDb - Gain in dB (positive = boost, negative = cut)
 * @param Q - Quality factor (default: 0.4 for a gentler shelf slope)
 */
export function computeHighShelfMagnitude(
  freq: number,
  fc: number = 2500,
  gainDb: number,
  Q: number = 0.4
): number {
  if (gainDb === 0) return 0;
  // High shelf = low shelf with inverted frequency
  return computeLowShelfMagnitude(fc * fc / freq, fc, gainDb, Q);
}

// ============================================================================
// TARGET CURVE BUILDER
// ============================================================================

/**
 * Build a modified target curve by applying tilt, bass shelf, and treble shelf
 * to an untilted DF baseline curve.
 *
 * @param baseline - Untilted diffuse field curve
 * @param params - Builder parameters (tilt, bassGain, trebleGain)
 * @returns Modified target curve with all adjustments applied
 */
export function buildTargetCurve(baseline: FrequencyCurve, params: BuilderParams): FrequencyCurve {
  const db = baseline.frequencies.map((freq, i) => {
    const tiltDb = computeTilt(freq, params.tilt);
    const bassDb = computeLowShelfMagnitude(freq, 105, params.bassGain);
    const trebleDb = computeHighShelfMagnitude(freq, 2500, params.trebleGain);
    return baseline.db[i] + tiltDb + bassDb + trebleDb;
  });

  return {
    frequencies: [...baseline.frequencies],
    db,
  };
}
