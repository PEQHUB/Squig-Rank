import { useState, useEffect, useRef } from 'react';
import { decode } from '@msgpack/msgpack';
import { parseFrequencyResponse, calculatePPI, logInterpolate } from '../utils/ppi';
import type { CalculationResult, ScoredIEM, ActiveViewType } from '../types';

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

interface Props {
  onCalculate: (results: CalculationResult | null) => void;
  isRanking: boolean;
  activeType: ActiveViewType;
}

const RIG_5128_DOMAINS = ["earphonesarchive", "crinacle5128", "listener5128"];

function getIEMRig(id: string): '711' | '5128' {
  const [subdomain, filename] = id.split('::');
  if (RIG_5128_DOMAINS.includes(subdomain)) return '5128';
  if (filename?.includes('(5128)')) return '5128';
  return '711';
}

// ============================================================================
// DATA LOADING
// ============================================================================

interface LoadedCurveData {
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

async function loadCurveData(): Promise<LoadedCurveData> {
  // Try MessagePack first (smaller, faster)
  try {
    const response = await fetch(`./data/curves.msgpack?v=${Date.now()}`);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const data = decode(new Uint8Array(buffer)) as CurvesDataMsgpack;
      
      return {
        frequencies: data.meta.frequencies,
        compensation711: data.meta.compensation711,
        compensation5128: data.meta.compensation5128,
        entries: data.entries.map(e => ({
          id: e.id,
          name: e.name,
          db: e.db,
          type: e.type === 1 ? 'headphone' : 'iem',
          quality: e.quality === 1 ? 'high' : 'low',
          price: e.price,
          rig: e.rig === 1 ? '5128' : '711',
          pinna: e.pinna
        }))
      };
    }
  } catch (e) {
    console.warn('MessagePack load failed, falling back to JSON:', e);
  }
  
  // Fallback to JSON
  const response = await fetch(`./data/curves.json?v=${Date.now()}`);
  if (!response.ok) throw new Error('Failed to load measurement data');
  
  const data: CurvesDataJson = await response.json();
  
  const entries = Object.entries(data.curves).map(([id, entry]) => {
    const isNewFormat = typeof entry === 'object' && !Array.isArray(entry);
    const db = isNewFormat ? (entry as CurveEntryJson).d : (entry as number[]);
    
    // Determine rig from entry or ID
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
  
  return {
    frequencies: data.meta.frequencies,
    compensation711: data.meta.compensation711,
    compensation5128: data.meta.compensation5128,
    entries
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TargetSubmission({ onCalculate, isRanking, activeType }: Props) {
  const [targetText, setTargetText] = useState('');
  const [targetName, setTargetName] = useState('My Custom Target');
  const [targetType, setTargetType] = useState<'711' | '5128'>('711');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setTargetText(content);
      setTargetName(file.name.replace(/\.txt$/i, ''));
    };
    reader.readAsText(file);
    
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

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

      // 2. Load Curves Data
      const data = await loadCurveData();
      const freqs = data.frequencies;
      const comp711 = data.compensation711;
      const comp5128 = data.compensation5128;

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
      
      // Determine what type of entries to include and what pinna filter (for headphones)
      const isHeadphoneMode = activeType === 'hp_kb5' || activeType === 'hp_5128';
      const targetPinna = activeType === 'hp_kb5' ? 'kb5' : activeType === 'hp_5128' ? '5128' : null;

      for (const entry of data.entries) {
        // Filter by active view type
        if (isHeadphoneMode) {
          if (entry.type !== 'headphone') continue;
          // Also filter by pinna for headphones
          if (targetPinna && entry.pinna !== targetPinna) continue;
        } else {
          if (entry.type !== 'iem') continue;
        }

        const iemCurve = { frequencies: freqs, db: entry.db };
        const iemRig = entry.rig;
        
        let activeTarget = targetBase;

        // Only apply compensation for IEMs (not for headphones per user request)
        if (!isHeadphoneMode) {
          if (targetType === '711') {
            if (iemRig === '5128') {
              activeTarget = targetPlus711Comp;
            }
          } else {
            if (iemRig === '711') {
              activeTarget = targetPlus5128Comp;
            }
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
  }, [targetType, activeType]);

  return (
    <div className="custom-target-upload">
      <h3>Live Ranking</h3>
      <p className="subtitle" style={{marginBottom: '12px'}}>
        Paste your custom target curve to instantly rank all {activeType === 'iem' ? 'IEMs' : activeType === 'hp_kb5' ? 'KEMAR (711) OE Headphones' : 'B&K 5128 OE Headphones'}.
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

        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef}
          accept=".txt"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        
        {/* Styled upload button */}
        <button 
          type="button"
          className="upload-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload .txt File
        </button>

        <textarea
          value={targetText}
          onChange={e => setTargetText(e.target.value)}
          placeholder={`Or paste target data here...\n20 95.0\n100 98.0\n1000 100.0\n...`}
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
