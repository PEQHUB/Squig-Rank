/**
 * Shared scoring pipeline for Squig-Rank
 *
 * Extracted from TargetSubmission.tsx to be reused by both
 * the custom target upload and the DF Target Builder.
 */

import { decode } from '@msgpack/msgpack';
import { calculatePPI, logInterpolate } from './ppi';
import type { CalculationResult, ScoredIEM, FrequencyCurve, CategoryFilter } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface CurveEntryMsgpack {
  id: string;
  name: string;
  db: number[];
  type: number; // 0: iem, 1: headphone
  quality: number; // 1: high quality
  price: number | null;
  rig: number; // 0: 711, 1: 5128
  pinna: string | null;
}

interface CurvesDataMsgpack {
  meta: {
    version: number;
    frequencies: number[];
    compensation711?: number[];
    compensation5128?: number[];
  };
  entries: CurveEntryMsgpack[];
}

// Legacy JSON format support
interface CurveEntryJson {
  d: number[];
  t: number;
  q: number;
  p: number | null;
  n: string | null;
}

interface CurvesDataJson {
  meta: {
    frequencies: number[];
    compensation711?: number[];
    compensation5128?: number[];
  };
  curves: Record<string, CurveEntryJson | number[]>;
}

export interface LoadedCurveData {
  frequencies: number[];
  compensation711?: number[];
  compensation5128?: number[];
  entries: Array<{
    id: string;
    name: string;
    db: number[];
    type: 'iem' | 'headphone';
    quality: 'high' | 'low';
    price: number | null;
    rig: '711' | '5128';
    pinna: string | null;
  }>;
}

// ============================================================================
// HELPERS
// ============================================================================

const RIG_5128_DOMAINS = ["earphonesarchive", "crinacle5128", "listener5128"];

function getIEMRig(id: string): '711' | '5128' {
  const [subdomain, filename] = id.split('::');
  if (RIG_5128_DOMAINS.includes(subdomain)) return '5128';
  if (filename?.includes('(5128)')) return '5128';
  return '711';
}

// ============================================================================
// DATA LOADING (cached)
// ============================================================================

let cachedCurveData: LoadedCurveData | null = null;

export async function loadCurveData(): Promise<LoadedCurveData> {
  if (cachedCurveData) return cachedCurveData;

  // Try MessagePack first (smaller, faster)
  try {
    const response = await fetch('./data/curves.msgpack');
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const data = decode(new Uint8Array(buffer)) as CurvesDataMsgpack;

      cachedCurveData = {
        frequencies: data.meta.frequencies,
        compensation711: data.meta.compensation711,
        compensation5128: data.meta.compensation5128,
        entries: data.entries.map(e => ({
          id: e.id,
          name: e.name,
          db: e.db,
          type: e.type === 1 ? 'headphone' as const : 'iem' as const,
          quality: e.quality === 1 ? 'high' as const : 'low' as const,
          price: e.price,
          rig: e.rig === 1 ? '5128' as const : '711' as const,
          pinna: e.pinna
        }))
      };
      return cachedCurveData;
    }
  } catch (e) {
    console.warn('MessagePack load failed, falling back to JSON:', e);
  }

  // Fallback to JSON
  const response = await fetch('./data/curves.json');
  if (!response.ok) throw new Error('Failed to load measurement data');

  const data: CurvesDataJson = await response.json();

  const entries = Object.entries(data.curves).map(([id, entry]) => {
    const isNewFormat = typeof entry === 'object' && !Array.isArray(entry);
    const db = isNewFormat ? (entry as CurveEntryJson).d : (entry as number[]);

    let rig: '711' | '5128' = '711';
    if (isNewFormat && (entry as CurveEntryJson).n === '5128') {
      rig = '5128';
    } else {
      rig = getIEMRig(id);
    }

    return {
      id,
      name: id.split('::')[1] || id,
      db,
      type: (isNewFormat && (entry as CurveEntryJson).t === 1 ? 'headphone' : 'iem') as 'iem' | 'headphone',
      quality: (isNewFormat && (entry as CurveEntryJson).q === 1 ? 'high' : 'low') as 'high' | 'low',
      price: isNewFormat ? (entry as CurveEntryJson).p : null,
      rig,
      pinna: isNewFormat ? (entry as CurveEntryJson).n : null
    };
  });

  cachedCurveData = {
    frequencies: data.meta.frequencies,
    compensation711: data.meta.compensation711,
    compensation5128: data.meta.compensation5128,
    entries
  };
  return cachedCurveData;
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Score all devices against a target curve.
 *
 * @param targetCurve - The target frequency response to compare against
 * @param targetType - Whether the target is for '711' or '5128' rig (for IEM compensation)
 * @param activeType - The current active view type (determines which devices to include)
 * @param targetName - Display name for the target
 * @returns CalculationResult with all devices scored and sorted by PPI
 */
export async function scoreAllDevices(
  targetCurve: FrequencyCurve,
  targetType: '711' | '5128',
  activeType: CategoryFilter,
  targetName: string
): Promise<CalculationResult> {
  const data = await loadCurveData();
  const freqs = data.frequencies;
  const comp711 = data.compensation711;

  // Helper to generate compensated target
  const getCompensatedTarget = (compArray: number[] | undefined): FrequencyCurve => {
    if (!compArray) return targetCurve;

    const alignedTarget = freqs.map(f => logInterpolate(targetCurve.frequencies, targetCurve.db, f));
    const newDb = alignedTarget.map((val, i) => {
      const comp = compArray[i] || 0;
      return val + comp;
    });

    return { frequencies: freqs, db: newDb };
  };

  const targetBase = targetCurve;
  const targetPlus711Comp = getCompensatedTarget(comp711);

  // Determine what type of entries to include
  const isHeadphoneMode = activeType === 'hp_kb5' || activeType === 'hp_5128';
  const isIem5128Mode = activeType === 'iem_5128';
  const targetPinna = activeType === 'hp_kb5' ? 'kb5' : activeType === 'hp_5128' ? '5128' : null;

  const scored: ScoredIEM[] = [];

  for (const entry of data.entries) {
    // Filter by active view type
    if (isHeadphoneMode) {
      if (entry.type !== 'headphone') continue;
      if (targetPinna && entry.pinna !== targetPinna) continue;
    } else if (isIem5128Mode) {
      // Only IEMs measured on the 5128 rig
      if (entry.type !== 'iem') continue;
      if (entry.rig !== '5128') continue;
    } else {
      if (entry.type !== 'iem') continue;
      if (entry.rig === '5128') continue;  // 711 mode: exclude 5128 IEMs
    }

    const iemCurve = { frequencies: freqs, db: entry.db };
    const iemRig = entry.rig;

    let activeTarget = targetBase;

    // Apply 711 compensation for all 711 IEMs (not for headphones or 5128 IEMs)
    if (!isHeadphoneMode) {
      if (iemRig === '711') {
        activeTarget = targetPlus711Comp;
      }
    }

    const result = calculatePPI(iemCurve, activeTarget);

    scored.push({
      id: entry.id,
      name: entry.name,
      similarity: result.ppi,
      stdev: result.stdev,
      slope: result.slope,
      avgError: result.avgError,
      price: entry.price,
      quality: entry.quality,
      type: entry.type,
      sourceDomain: `${entry.id.split('::')[0]}.squig.link`,
      rig: iemRig,
      pinna: entry.pinna as any,
      frequencyData: iemCurve
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  return {
    targetName: `${targetName} (${targetType})`,
    targetFileName: 'custom.txt',
    scoringMethod: 'ppi',
    ranked: scored
  };
}

/**
 * Score ALL IEMs (both 711 and 5128 rigs) against a target curve.
 * Applies rig-appropriate compensation: 711 comp for 711-rig IEMs, base target for 5128-rig.
 * Returns a single merged ranked list.
 */
export async function scoreAllDevicesCombined(
  targetCurve: FrequencyCurve,
  targetName: string
): Promise<CalculationResult> {
  const data = await loadCurveData();
  const freqs = data.frequencies;
  const comp711 = data.compensation711;

  const getCompensatedTarget = (compArray: number[] | undefined): FrequencyCurve => {
    if (!compArray) return targetCurve;
    const alignedTarget = freqs.map(f => logInterpolate(targetCurve.frequencies, targetCurve.db, f));
    const newDb = alignedTarget.map((val, i) => {
      const comp = compArray[i] || 0;
      return val + comp;
    });
    return { frequencies: freqs, db: newDb };
  };

  const targetBase = targetCurve;
  const targetPlus711Comp = getCompensatedTarget(comp711);

  const scored: ScoredIEM[] = [];

  for (const entry of data.entries) {
    if (entry.type !== 'iem') continue;  // IEMs only, both rigs

    const iemCurve = { frequencies: freqs, db: entry.db };
    const iemRig = entry.rig;

    // Apply 711 compensation for 711-rig IEMs, base target for 5128
    const activeTarget = iemRig === '711' ? targetPlus711Comp : targetBase;

    const result = calculatePPI(iemCurve, activeTarget);

    scored.push({
      id: entry.id,
      name: entry.name,
      similarity: result.ppi,
      stdev: result.stdev,
      slope: result.slope,
      avgError: result.avgError,
      price: entry.price,
      quality: entry.quality,
      type: entry.type,
      sourceDomain: `${entry.id.split('::')[0]}.squig.link`,
      rig: iemRig,
      pinna: entry.pinna as any,
      frequencyData: iemCurve
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  return {
    targetName: `${targetName} (All Rigs)`,
    targetFileName: 'custom.txt',
    scoringMethod: 'ppi',
    ranked: scored
  };
}
