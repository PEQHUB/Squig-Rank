import { useState, useEffect, useCallback, useRef } from 'react';
import { parseFrequencyResponse } from '../utils/ppi';
import { buildTargetCurve, CATEGORY_DEFAULTS } from '../utils/shelfFilter';
import { scoreAllDevices } from '../utils/scoring';
import type { BaselinePresetKey, BaselineSelection, BuilderParams, CalculationResult, CategoryFilter, FrequencyCurve } from '../types';

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
  iem: '711 IEMs',
  hp_kb5: 'KB5 (711) OE Headphones',
  hp_5128: 'B&K 5128 OE Headphones',
  iem_5128: 'B&K 5128 IEMs',
};

const BASELINE_LABELS: Record<BaselinePresetKey, string> = {
  iem: 'ISO 11904-2 DF',
  hp_kb5: 'KEMAR DF (KB50xx)',
  hp_5128: '5128 DF',
  iem_5128: 'JM-1 DF',
};

// Module-level cache for fetched baselines
const baselineCache = new Map<string, FrequencyCurve>();

async function loadBaseline(key: BaselinePresetKey): Promise<FrequencyCurve> {
  const cached = baselineCache.get(key);
  if (cached) return cached;

  const url = BASELINE_FILES[key];
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Baseline DF curve not available for ${BASELINE_LABELS[key]}.`);
  }

  const text = await response.text();
  const curve = parseFrequencyResponse(text);
  if (curve.frequencies.length < 10) {
    throw new Error(`Invalid baseline curve for ${BASELINE_LABELS[key]} (need at least 10 frequency points).`);
  }

  baselineCache.set(key, curve);
  return curve;
}

async function resolveBaseline(selection: BaselineSelection): Promise<FrequencyCurve> {
  if (selection.type === 'custom' && selection.customCurve) {
    return selection.customCurve;
  }
  return loadBaseline(selection.presetKey!);
}

function getBaselineDisplayName(sel: BaselineSelection): string {
  if (sel.type === 'custom' && sel.customName) return sel.customName;
  if (sel.presetKey) return BASELINE_LABELS[sel.presetKey];
  return 'Unknown';
}

// ============================================================================
// COMPONENT
// ============================================================================

interface Props {
  category: CategoryFilter;
  siblingCategory: CategoryFilter;
  siblingParams: BuilderParams;
  params: BuilderParams;
  onParamsChange: (params: BuilderParams) => void;
  onCalculate: (category: CategoryFilter, result: CalculationResult) => void;
  onReset: (category: CategoryFilter) => void;
  isRanking: boolean;
  isSiblingRanking: boolean;
  baselineSelection: BaselineSelection;
  siblingBaselineSelection: BaselineSelection;
  onBaselineChange: (selection: BaselineSelection) => void;
}

export function DFTargetBuilder({
  category,
  siblingCategory,
  siblingParams,
  params,
  onParamsChange,
  onCalculate,
  onReset,
  isRanking,
  isSiblingRanking,
  baselineSelection,
  siblingBaselineSelection,
  onBaselineChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBuiltCurve, setLastBuiltCurve] = useState<FrequencyCurve | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const baselineFileRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleParamChange = (key: keyof BuilderParams, value: number) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handleBaselineFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const curve = parseFrequencyResponse(content);
      if (curve.frequencies.length < 10) {
        setError('Custom baseline needs at least 10 frequency points.');
        return;
      }
      setError(null);
      onBaselineChange({
        type: 'custom',
        customCurve: curve,
        customName: file.name.replace(/\.txt$/i, ''),
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCheck = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const baseline = await resolveBaseline(baselineSelection);
      const modifiedTarget = buildTargetCurve(baseline, params);
      setLastBuiltCurve(modifiedTarget);

      const rigType = RIG_FOR_CATEGORY[category];
      const activeType = category === 'iem' ? 'iem' : category;
      const baselineName = getBaselineDisplayName(baselineSelection);
      const targetName = `${baselineName} (Tilt: ${params.tilt}, Bass: ${params.bassGain}, Treble: ${params.trebleGain})`;

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
  }, [category, params, baselineSelection, onCalculate]);

  const handleCheckBoth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [baseline, siblingBaseline] = await Promise.all([
        resolveBaseline(baselineSelection),
        resolveBaseline(siblingBaselineSelection),
      ]);

      const modifiedTarget = buildTargetCurve(baseline, params);
      const siblingModifiedTarget = buildTargetCurve(siblingBaseline, siblingParams);
      setLastBuiltCurve(modifiedTarget);

      const baselineName = getBaselineDisplayName(baselineSelection);
      const siblingBaselineName = getBaselineDisplayName(siblingBaselineSelection);
      const targetName = `${baselineName} (Tilt: ${params.tilt}, Bass: ${params.bassGain}, Treble: ${params.trebleGain})`;
      const siblingTargetName = `${siblingBaselineName} (Tilt: ${siblingParams.tilt}, Bass: ${siblingParams.bassGain}, Treble: ${siblingParams.trebleGain})`;

      const [result, siblingResult] = await Promise.all([
        scoreAllDevices(modifiedTarget, RIG_FOR_CATEGORY[category], category === 'iem' ? 'iem' : category, targetName),
        scoreAllDevices(siblingModifiedTarget, RIG_FOR_CATEGORY[siblingCategory], siblingCategory === 'iem' ? 'iem' : siblingCategory, siblingTargetName),
      ]);

      onCalculate(category, result);
      onCalculate(siblingCategory, siblingResult);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Scoring failed');
    } finally {
      setLoading(false);
    }
  }, [category, siblingCategory, params, siblingParams, baselineSelection, siblingBaselineSelection, onCalculate]);

  // Auto-re-rank when rig/category changes while ranking is active
  useEffect(() => {
    if (isRanking) {
      handleCheck();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Auto-re-rank when baseline changes while ranking is active
  useEffect(() => {
    if (isRanking) {
      handleCheck();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineSelection]);

  const handleReset = () => {
    onParamsChange({ ...CATEGORY_DEFAULTS[category] });
    onBaselineChange({ type: 'preset', presetKey: category as BaselinePresetKey });
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

      {/* Baseline Selector Row */}
      <div className="baseline-selector">
        <span className="baseline-label">Baseline</span>
        <span className="baseline-name">{getBaselineDisplayName(baselineSelection)}</span>

        <div className="baseline-dropdown-wrapper" ref={dropdownRef}>
          <button
            className="baseline-dropdown-btn"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            title="Choose a preset baseline"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {dropdownOpen && (
            <div className="baseline-dropdown-menu">
              {(['iem', 'hp_kb5', 'hp_5128', 'iem_5128'] as BaselinePresetKey[]).map(key => (
                <button
                  key={key}
                  className={`baseline-dropdown-item ${
                    baselineSelection.type === 'preset' && baselineSelection.presetKey === key ? 'active' : ''
                  }`}
                  onClick={() => {
                    onBaselineChange({ type: 'preset', presetKey: key });
                    setDropdownOpen(false);
                  }}
                >
                  {BASELINE_LABELS[key]}
                  {key === category && <span className="baseline-default-tag">default</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          type="file"
          ref={baselineFileRef}
          accept=".txt"
          onChange={handleBaselineFileUpload}
          style={{ display: 'none' }}
        />
        <button
          className="baseline-upload-btn"
          onClick={() => baselineFileRef.current?.click()}
          title="Upload custom baseline .txt"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2V8M3 5L6 2L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

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
            Reset
          </button>
        )}

        <button
          className="submit-btn"
          onClick={handleCheck}
          disabled={loading}
        >
          {loading ? 'Ranking...' : (isRanking ? 'Re-Rank' : 'Rank')}
        </button>

        <button
          className="submit-btn rank-both-btn"
          onClick={handleCheckBoth}
          disabled={loading}
        >
          {loading ? 'Ranking...' : ((isRanking || isSiblingRanking) ? 'Re-Rank Both Rigs' : 'Rank Both Rigs')}
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
