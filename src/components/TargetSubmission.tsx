import { useState } from 'react';
import { parseFrequencyResponse, calculatePPI } from '../utils/ppi';
import type { CalculationResult, ScoredIEM } from '../types';

interface CurvesData {
  meta: { frequencies: number[] };
  curves: Record<string, number[]>;
}

interface Props {
  onCalculate: (results: CalculationResult | null) => void;
  isRanking: boolean;
}

export function TargetSubmission({ onCalculate, isRanking }: Props) {
  const [targetText, setTargetText] = useState('');
  const [targetName, setTargetName] = useState('My Custom Target');
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
      const targetCurve = parseFrequencyResponse(targetText);
      if (targetCurve.frequencies.length < 10) {
        throw new Error('Invalid target data (need at least 10 points)');
      }

      // 2. Fetch Curves Data
      const response = await fetch('./data/curves.json');
      if (!response.ok) throw new Error('Failed to load measurement data');
      const data: CurvesData = await response.json();

      // 3. Calculate Scores
      const scored: ScoredIEM[] = [];
      const freqs = data.meta.frequencies;

      for (const [id, db] of Object.entries(data.curves)) {
        // Reconstruct curve object from compact format
        const iemCurve = { frequencies: freqs, db };
        
        // Calculate PPI
        const result = calculatePPI(iemCurve, targetCurve);
        
        // Infer metadata from ID (subdomain::filename)
        const [subdomain, fileName] = id.split('::');
        // We don't have full metadata (price, display name) here perfectly,
        // but we can make do or we'd need to fetch results.json to map it back.
        // Actually, results.json is already loaded in Home.tsx. 
        // Ideally we'd map this back to the full objects.
        // For now, let's generate a basic object.
        
        scored.push({
          id,
          name: fileName, // Fallback name
          similarity: result.ppi,
          stdev: result.stdev,
          slope: result.slope,
          avgError: result.avgError,
          price: null, // Unknown
          quality: 'low', // Unknown, default low
          sourceDomain: `${subdomain}.squig.link`,
          rig: '711', // Unknown default
          frequencyData: iemCurve // Optional but we have it
        });
      }

      // Sort
      scored.sort((a, b) => b.similarity - a.similarity);

      // 4. Return Result
      onCalculate({
        targetName: targetName,
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
        Paste your custom target curve (Frequency, dB) to instantly rank all IEMs.
      </p>

      <div className="input-group">
        <input 
          type="text" 
          value={targetName}
          onChange={e => setTargetName(e.target.value)}
          placeholder="Target Name"
          className="target-name-input"
        />
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
