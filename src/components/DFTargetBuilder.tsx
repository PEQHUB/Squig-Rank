import { useState } from 'react';
import { parseFrequencyResponse } from '../utils/ppi';
import { buildTargetCurve, CATEGORY_DEFAULTS } from '../utils/shelfFilter';
import { scoreAllDevices } from '../utils/scoring';
import type { BuilderParams, CalculationResult, CategoryFilter, FrequencyCurve } from '../types';

// ============================================================================
// BASELINE LOADING
// ============================================================================

const BASELINE_FILES: Record<CategoryFilter, string> = {
  iem: './targets/df-baselines/ISO 11904-2 DF  Target.txt',
  hp_kb5: './targets/df-baselines/KEMAR DF (KB50xx)  Target.txt',
  hp_5128: './targets/df-baselines/5128 DF  Target.txt',
  iem_5128: './targets/df-baselines/JM-1 DF  Target.txt',
};

const RIG_FOR_CATEGORY: Record<CategoryFilter, '711' | '5128'> = {
  iem: '711',
  hp_kb5: '711',
  hp_5128: '5128',
  iem_5128: '5128',
};

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  iem: 'IEMs',
  hp_kb5: 'KB5 (711) OE Headphones',
  hp_5128: 'B&K 5128 OE Headphones',
  iem_5128: 'B&K 5128 IEMs',
};

// Module-level cache for fetched baselines
const baselineCache = new Map<string, FrequencyCurve>();

async function loadBaseline(category: CategoryFilter): Promise<FrequencyCurve> {
  const cached = baselineCache.get(category);
  if (cached) return cached;

  const url = BASELINE_FILES[category];
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Baseline DF curve not available for ${CATEGORY_LABELS[category]}. Please add the untilted DF file.`);
  }

  const text = await response.text();
  const curve = parseFrequencyResponse(text);
  if (curve.frequencies.length < 10) {
    throw new Error(`Invalid baseline curve for ${CATEGORY_LABELS[category]} (need at least 10 frequency points).`);
  }

  baselineCache.set(category, curve);
  return curve;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface Props {
  category: CategoryFilter;
  params: BuilderParams;
  onParamsChange: (params: BuilderParams) => void;
  onCalculate: (category: CategoryFilter, result: CalculationResult) => void;
  onReset: (category: CategoryFilter) => void;
  isRanking: boolean;
}

export function DFTargetBuilder({
  category,
  params,
  onParamsChange,
  onCalculate,
  onReset,
  isRanking,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBuiltCurve, setLastBuiltCurve] = useState<FrequencyCurve | null>(null);

  const handleParamChange = (key: keyof BuilderParams, value: number) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handleCheck = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Load untilted DF baseline for this category
      const baseline = await loadBaseline(category);

      // 2. Apply tilt + bass shelf + treble shelf
      const modifiedTarget = buildTargetCurve(baseline, params);
      setLastBuiltCurve(modifiedTarget);

      // 3. Score all devices
      const rigType = RIG_FOR_CATEGORY[category];
      const activeType = category === 'iem' ? 'iem' : category;
      const targetName = `DF (Tilt: ${params.tilt}, Bass: ${params.bassGain}, Treble: ${params.trebleGain})`;

      const result = await scoreAllDevices(
        modifiedTarget,
        rigType,
        activeType,
        targetName
      );

      onCalculate(category, result);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Scoring failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    onParamsChange({ ...CATEGORY_DEFAULTS[category] });
    setLastBuiltCurve(null);
    onReset(category);
  };

  const handleDownload = () => {
    if (!lastBuiltCurve) return;
    const lines = lastBuiltCurve.frequencies.map(
      (freq, i) => `${freq}\t${lastBuiltCurve.db[i].toFixed(6)}`
    );
    const content = lines.join('\n') + '\n';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DF Target (Tilt ${params.tilt}, Bass ${params.bassGain}, Treble ${params.trebleGain}).txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="df-target-builder">
      <p className="subtitle" style={{ marginBottom: '12px' }}>
        Adjust the DF target curve for {CATEGORY_LABELS[category]} and press Check to rank.
      </p>

      <div className="builder-controls">
        {/* Tilt Slider */}
        <div className="builder-slider">
          <label>
            <span className="slider-label">Tilt</span>
            <span className="slider-value">{params.tilt.toFixed(1)} dB/oct</span>
          </label>
          <input
            type="range"
            min={-2}
            max={0.5}
            step={0.1}
            value={params.tilt}
            onChange={e => handleParamChange('tilt', parseFloat(e.target.value))}
          />
        </div>

        {/* Bass Shelf Slider */}
        <div className="builder-slider">
          <label>
            <span className="slider-label">Bass (105 Hz)</span>
            <span className="slider-value">{params.bassGain.toFixed(1)} dB</span>
          </label>
          <input
            type="range"
            min={-10}
            max={10}
            step={0.5}
            value={params.bassGain}
            onChange={e => handleParamChange('bassGain', parseFloat(e.target.value))}
          />
        </div>

        {/* Treble Shelf Slider */}
        <div className="builder-slider">
          <label>
            <span className="slider-label">Treble (2.5 kHz)</span>
            <span className="slider-value">{params.trebleGain.toFixed(1)} dB</span>
          </label>
          <input
            type="range"
            min={-10}
            max={10}
            step={0.5}
            value={params.trebleGain}
            onChange={e => handleParamChange('trebleGain', parseFloat(e.target.value))}
          />
        </div>
      </div>

      {error && <p className="upload-error">{error}</p>}

      <div className="builder-actions">
        {isRanking && (
          <button className="reset-btn" onClick={handleReset}>
            Reset to Default
          </button>
        )}

        <button
          className="submit-btn"
          onClick={handleCheck}
          disabled={loading}
        >
          {loading ? 'Ranking...' : (isRanking ? 'Re-Check' : 'Check')}
        </button>

        {lastBuiltCurve && (
          <button className="download-target-btn" onClick={handleDownload}>
            Download Target
          </button>
        )}
      </div>
    </div>
  );
}
