import { useState, useEffect } from 'react';
import { parseFrequencyResponse, calculatePPI, logInterpolate } from '../utils/ppi';
import type { CalculationResult, ScoredIEM } from '../types';

interface CurveEntry {
  d: number[];
  t: number; // 0: iem, 1: headphone
  q: number; // 1: high quality
  p: number | null; // price
  n: string | null; // pinna
}

interface CurvesData {
  meta: { 
    frequencies: number[];
    compensation711?: number[];
    compensation5128?: number[];
  };
  curves: Record<string, CurveEntry | number[]>;
}

interface Props {
  onCalculate: (results: CalculationResult | null) => void;
  isRanking: boolean;
  activeType: 'iem' | 'headphone';
}

const RIG_5128_DOMAINS = ["earphonesarchive", "crinacle5128", "listener5128"];

function getIEMRig(id: string): '711' | '5128' {
  const [subdomain, filename] = id.split('::');
  if (RIG_5128_DOMAINS.includes(subdomain)) return '5128';
  if (filename.includes('(5128)')) return '5128';
  return '711';
}

export function TargetSubmission({ onCalculate, isRanking, activeType }: Props) {
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
      const response = await fetch(`./data/curves.json?v=${Date.now()}`);
      if (!response.ok) throw new Error('Failed to load measurement data');
      const data: CurvesData = await response.json();

      const freqs = data.meta.frequencies;
      const comp711 = data.meta.compensation711;
      const comp5128 = data.meta.compensation5128;

      // Helper to generate compensated target
      const getCompensatedTarget = (compArray: number[] | undefined) => {
        if (!compArray) return parsedTarget;
        
        const alignedTarget = freqs.map(f => logInterpolate(parsedTarget.frequencies, parsedTarget.db, f));
        const newDb = alignedTarget.map((val, i) => {
          const comp = compArray[i] || 0;
          return val + comp;
        });
        
        return { frequencies: freqs, db: newDb };
      };

      const targetBase = parsedTarget; 
      const targetPlus711Comp = getCompensatedTarget(comp711);
      const targetPlus5128Comp = getCompensatedTarget(comp5128);

      // 3. Calculate Scores
      const scored: ScoredIEM[] = [];

      for (const [id, entry] of Object.entries(data.curves)) {
        // Handle both old and new format for robust transition
        const isNewFormat = typeof entry === 'object' && !Array.isArray(entry);
        const db = isNewFormat ? (entry as CurveEntry).d : (entry as number[]);
        const type = isNewFormat ? ((entry as CurveEntry).t === 1 ? 'headphone' : 'iem') : 'iem';
        const quality = isNewFormat ? ((entry as CurveEntry).q === 1 ? 'high' : 'low') : 'low';
        const price = isNewFormat ? (entry as CurveEntry).p : null;
        const pinna = isNewFormat ? (entry as CurveEntry).n : null;

        // Filter by active view
        if (type !== activeType) continue;

        const iemCurve = { frequencies: freqs, db };
        
        // Determine rig
        let iemRig: '711' | '5128' = '711';
        if (isNewFormat && (entry as CurveEntry).n === '5128') {
            iemRig = '5128';
        } else {
            iemRig = getIEMRig(id);
        }
        
        let activeTarget = targetBase;

        if (targetType === '711') {
          if (iemRig === '5128') {
            activeTarget = targetPlus711Comp;
          }
        } else {
          if (iemRig === '711') {
            activeTarget = targetPlus5128Comp;
          }
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
          price,
          quality,
          type,
          sourceDomain: `${subdomain}.squig.link`,
          rig: iemRig,
          pinna: pinna as any,
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
    onCalculate(null);
  };

  useEffect(() => {
    if (isRanking && targetText.trim()) {
      handleRank();
    }
  }, [targetType, activeType]); // Also re-rank when view changes

  return (
    <div className="custom-target-upload">
      <h3>Live Ranking</h3>
      <p className="subtitle" style={{marginBottom: '12px'}}>
        Paste your custom target curve to instantly rank all {activeType === 'iem' ? 'IEMs' : 'Headphones'}.
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
            <div className="rig-toggle">
              <button 
                type="button"
                className={`rig-btn ${targetType === '711' ? 'active' : ''}`}
                onClick={() => setTargetType('711')}
              >
                711
              </button>
              <button 
                type="button"
                className={`rig-btn ${targetType === '5128' ? 'active' : ''}`}
                onClick={() => setTargetType('5128')}
              >
                5128
              </button>
            </div>
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
          {loading ? 'Ranking...' : (isRanking ? 'Update Rankings' : `Rank All ${activeType === 'iem' ? 'IEMs' : 'Headphones'}`)}
        </button>
      </div>
    </div>
  );
}
