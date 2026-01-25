import { useState, useEffect } from 'react';
import { parseFrequencyResponse, calculatePPI, logInterpolate } from '../utils/ppi';
import type { CalculationResult, ScoredIEM } from '../types';

interface CurvesData {
  meta: { 
    frequencies: number[];
    compensation711?: number[];
    compensation5128?: number[];
  };
  curves: Record<string, number[]>;
}

interface Props {
  onCalculate: (results: CalculationResult | null) => void;
  isRanking: boolean;
}

const RIG_5128_DOMAINS = ["earphonesarchive", "crinacle5128", "listener5128"];

function getIEMRig(id: string): '711' | '5128' {
  const [subdomain, filename] = id.split('::');
  if (RIG_5128_DOMAINS.includes(subdomain)) return '5128';
  if (filename.includes('(5128)')) return '5128';
  return '711';
}

export function TargetSubmission({ onCalculate, isRanking }: Props) {
  const [targetText, setTargetText] = useState('');
  const [targetName, setTargetName] = useState('My Custom Target');
  const [targetType, setTargetType] = useState<'711' | '5128'>('711');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRank = async () => {
    if (!targetText.trim()) {
      setError('Please paste target data first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Parse User Target
      const parsedTarget = parseFrequencyResponse(targetText);
      if (parsedTarget.frequencies.length < 10) {
        throw new Error('Invalid target data (need at least 10 points)');
      }

      // 2. Fetch Curves Data
      // Add cache busting to ensure we get fresh metadata (compensation curves)
      const response = await fetch(`./data/curves.json?v=${Date.now()}`);
      if (!response.ok) throw new Error('Failed to load measurement data');
      const data: CurvesData = await response.json();

      const freqs = data.meta.frequencies;
      const comp711 = data.meta.compensation711;
      const comp5128 = data.meta.compensation5128;

      // Helper to generate compensated target
      const getCompensatedTarget = (compArray: number[] | undefined) => {
        if (!compArray) return parsedTarget; // Fallback
        
        // Align user target to system frequencies first
        const alignedTarget = freqs.map(f => logInterpolate(parsedTarget.frequencies, parsedTarget.db, f));
        
        const newDb = alignedTarget.map((val, i) => {
          const comp = compArray[i] || 0;
          return val + comp; // Always ADD the compensation
        });
        
        return { frequencies: freqs, db: newDb };
      };

      // Pre-calculate variants
      const targetBase = parsedTarget; 
      
      // Target (711) + Comp711 = Target (5128)
      const targetPlus711Comp = getCompensatedTarget(comp711);
      
      // Target (5128) + Comp5128 = Target (711)
      const targetPlus5128Comp = getCompensatedTarget(comp5128);

      // 3. Calculate Scores
      const scored: ScoredIEM[] = [];

      for (const [id, db] of Object.entries(data.curves)) {
        const iemCurve = { frequencies: freqs, db };
        const iemRig = getIEMRig(id);
        
        let activeTarget = targetBase;

        if (targetType === '711') {
          // User provided a 711 Target
          if (iemRig === '5128') {
            // Need to convert 711 Target -> 5128 Target
            activeTarget = targetPlus711Comp;
          }
          // else (711 IEM) -> Use Base
        } else {
          // User provided a 5128 Target
          if (iemRig === '711') {
            // Need to convert 5128 Target -> 711 Target
            activeTarget = targetPlus5128Comp;
          }
          // else (5128 IEM) -> Use Base
        }
        
        const result = calculatePPI(iemCurve, activeTarget);
        
        const [subdomain, fileName] = id.split('::');
        
        scored.push({
          id,
          name: fileName,
          similarity: result.ppi,
          stdev: result.stdev,
          slope: result.slope,
          avgError: result.avgError,
          price: null,
          quality: 'low',
          type: 'iem',
          sourceDomain: `${subdomain}.squig.link`,
          rig: iemRig,
          frequencyData: iemCurve
        });
      }

      scored.sort((a, b) => b.similarity - a.similarity);

      onCalculate({
        targetName: `${targetName} (${targetType})`,
        targetFileName: 'custom.txt',
        scoringMethod: 'ppi',
        ranked: scored
      });

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Ranking failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    // Keep the text so user can tweak it
    onCalculate(null);
  };

  // Auto-rank when rig changes if we already have rankings or valid text
  // Actually, let's just make it reactive if results are showing
  useEffect(() => {
    if (isRanking && targetText.trim()) {
      handleRank();
    }
  }, [targetType]);

  return (
    <div className="custom-target-upload">
      <h3>Live Ranking</h3>
      <p className="subtitle" style={{marginBottom: '16px'}}>
        Paste your custom target curve to instantly rank all IEMs.
      </p>

      <div className="input-group">
        <div style={{ display: 'flex', gap: '12px' }}>
          <input 
            type="text" 
            value={targetName}
            onChange={e => setTargetName(e.target.value)}
            placeholder="Target Name"
            className="target-name-input"
            style={{ flex: 1 }}
          />
          <div className="rig-selector">
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginRight: '8px' }}>Target is for:</span>
            <label className="rig-option">
              <input 
                type="radio" 
                checked={targetType === '711'} 
                onChange={() => setTargetType('711')}
              /> 711
            </label>
            <label className="rig-option">
              <input 
                type="radio" 
                checked={targetType === '5128'} 
                onChange={() => setTargetType('5128')}
              /> 5128
            </label>
          </div>
        </div>

        <textarea
          value={targetText}
          onChange={e => setTargetText(e.target.value)}
          placeholder={`20 95.0\n100 98.0\n1000 100.0\n...`}
          rows={6}
          className="target-textarea"
        />
      </div>

      {error && <p className="upload-error">{error}</p>}

      <div className="submission-actions">
        {isRanking && (
           <button className="reset-btn" onClick={handleReset}>
             Clear & Show Standard Rankings
           </button>
        )}
        
        <button 
          className="submit-btn" 
          onClick={handleRank}
          disabled={loading}
        >
          {loading ? 'Ranking...' : (isRanking ? 'Update Rankings' : 'Rank All IEMs')}
        </button>
      </div>
    </div>
  );
}
