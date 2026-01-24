import { useState, useEffect, useCallback } from 'react';
import { SimilarityList } from '../components/SimilarityList';
import { CustomTargetUpload, loadCustomTargets, saveCustomTargets } from '../components/CustomTargetUpload';
import { calculatePPI } from '../utils/ppi';
import type { CalculationResult, CustomTarget, ScoredIEM } from '../types';

interface ResultsData {
  generatedAt: string;
  totalIEMs: number;
  results: CalculationResult[];
  // Raw IEM data for custom target calculation
  rawIEMs?: Array<{
    id: string;
    name: string;
    frequencyData: { frequencies: number[]; db: number[] };
    price: number | null;
    quality: 'high' | 'low';
    sourceDomain: string;
    rig: '711' | '5128';
  }>;
}

export default function Home() {
  const [results, setResults] = useState<CalculationResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [totalIEMs, setTotalIEMs] = useState<number>(0);
  const [customTargets, setCustomTargets] = useState<CustomTarget[]>([]);
  const [customResults, setCustomResults] = useState<CalculationResult[]>([]);
  const [calculatingCustom, setCalculatingCustom] = useState(false);

  // Load custom targets from localStorage on mount
  useEffect(() => {
    const savedTargets = loadCustomTargets();
    setCustomTargets(savedTargets);
  }, []);

  useEffect(() => {
    async function loadResults() {
      try {
        const response = await fetch('./data/results.json');
        if (!response.ok) {
          throw new Error('Results not available yet');
        }
        const data: ResultsData = await response.json();
        setResults(data.results);
        setLastUpdate(data.generatedAt);
        setTotalIEMs(data.totalIEMs);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadResults();
  }, []);

  // Calculate PPI for custom targets using first result's IEMs as reference
  const calculateCustomTargetResults = useCallback(async (targets: CustomTarget[]) => {
    if (!results || results.length === 0 || targets.length === 0) {
      setCustomResults([]);
      return;
    }

    setCalculatingCustom(true);

    // Use IEMs from first result as base data
    const baseIEMs = results[0].ranked;
    
    // Calculate in chunks to avoid blocking UI
    const newResults: CalculationResult[] = [];
    
    for (const target of targets) {
      const scored: ScoredIEM[] = [];
      
      for (const iem of baseIEMs) {
        // We need the frequency data - for now we'll use existing scores as proxy
        // In a full implementation, we'd need to store/fetch frequency data
        // For now, this is a placeholder that shows the structure
        const ppiResult = calculatePPI(
          { frequencies: [20, 1000, 20000], db: [0, 0, 0] }, // placeholder
          target.curve
        );
        
        scored.push({
          ...iem,
          similarity: ppiResult.ppi,
          stdev: ppiResult.stdev,
          slope: ppiResult.slope,
          avgError: ppiResult.avgError
        });
      }

      scored.sort((a, b) => b.similarity - a.similarity);
      
      newResults.push({
        targetName: target.name,
        targetFileName: target.fileName,
        scoringMethod: 'ppi',
        ranked: scored
      });
    }

    setCustomResults(newResults);
    setCalculatingCustom(false);
  }, [results]);

  // Recalculate when custom targets change
  useEffect(() => {
    if (customTargets.length > 0 && results) {
      calculateCustomTargetResults(customTargets);
    } else {
      setCustomResults([]);
    }
  }, [customTargets, results, calculateCustomTargetResults]);

  const handleTargetAdded = (target: CustomTarget) => {
    // Check if already exists
    if (customTargets.some(t => t.fileName === target.fileName)) {
      return;
    }
    
    const newTargets = [...customTargets, target];
    setCustomTargets(newTargets);
    saveCustomTargets(newTargets);
  };

  const handleRemoveTarget = (fileName: string) => {
    const newTargets = customTargets.filter(t => t.fileName !== fileName);
    setCustomTargets(newTargets);
    saveCustomTargets(newTargets);
  };

  if (loading) {
    return (
      <div className="home">
        <h1 className="title">Squig-Rank</h1>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="home">
        <h1 className="title">Squig-Rank</h1>
        <div className="error">
          <p>No scan results available yet.</p>
          <p className="error-detail">The scanner runs every 30 minutes. Check back soon!</p>
        </div>
      </div>
    );
  }

  // Combine server results with custom results
  const allResults = [...results, ...customResults];

  return (
    <div className="home">
      <h1 className="title">Squig-Rank</h1>
      <p className="subtitle">IEM Preference Prediction Index Rankings</p>
      <div className="meta">
        <span>{totalIEMs.toLocaleString()} IEMs scanned</span>
        {lastUpdate && (
          <span className="last-update">
            Updated {new Date(lastUpdate).toLocaleString()}
          </span>
        )}
      </div>
      
      <CustomTargetUpload 
        onTargetAdded={handleTargetAdded}
        customTargets={customTargets}
        onRemoveTarget={handleRemoveTarget}
      />
      
      {calculatingCustom && (
        <div className="calculating">Calculating custom target scores...</div>
      )}
      
      <SimilarityList results={allResults} />
    </div>
  );
}
