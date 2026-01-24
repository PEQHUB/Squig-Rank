import { useState } from 'react';
import { parseFrequencyResponse, calculatePPI, logInterpolate } from '../utils/ppi';
import type { CalculationResult, ScoredIEM } from '../types';

interface CurvesData {
  meta: { 
    frequencies: number[];
    compensation711?: number[];
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
      const response = await fetch('./data/curves.json');
      if (!response.ok) throw new Error('Failed to load measurement data');
      const data: CurvesData = await response.json();

      const freqs = data.meta.frequencies;
      const comp711 = data.meta.compensation711; // Array matching freqs length

      // Helper to generate compensated target
      const getCompensatedTarget = (mode: 'add' | 'subtract') => {
        if (!comp711) return parsedTarget; // Fallback if missing
        
        // Align user target to system frequencies first
        const alignedTarget = freqs.map(f => logInterpolate(parsedTarget.frequencies, parsedTarget.db, f));
        
        const newDb = alignedTarget.map((val, i) => {
          const comp = comp711[i] || 0;
          return mode === 'add' ? val + comp : val - comp;
        });
        
        return { frequencies: freqs, db: newDb };
      };

      // Pre-calculate variants
      const targetBase = parsedTarget; 
      // Note: calculatePPI aligns input curves anyway, so we can pass raw parsedTarget.
      // But for compensated, we constructed it aligned to 'freqs'.
      
      const targetPlusComp = getCompensatedTarget('add');
      const targetMinusComp = getCompensatedTarget('subtract');

      // 3. Calculate Scores
      const scored: ScoredIEM[] = [];

      for (const [id, db] of Object.entries(data.curves)) {
        const iemCurve = { frequencies: freqs, db };
        const iemRig = getIEMRig(id);
        
        let activeTarget = targetBase;

        if (targetType === '711') {
          if (iemRig === '5128') activeTarget = targetPlusComp;
          // else (711) use base
        } else {
          // targetType === '5128'
          if (iemRig === '711') activeTarget = targetMinusComp;
          // else (5128) use base
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
    setTargetText('');
    onCalculate(null);
  };

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
        {isRanking ? (
           <button className="reset-btn" onClick={handleReset}>
             Clear & Show Standard Rankings
           </button>
        ) : (
          <button 
            className="submit-btn" 
            onClick={handleRank}
            disabled={loading}
          >
            {loading ? 'Ranking...' : 'Rank All IEMs'}
          </button>
        )}
      </div>
    </div>
  );
}
