import { useState, useEffect } from 'react';
import { SimilarityList } from '../components/SimilarityList';
import { TargetSubmission } from '../components/TargetSubmission';
import type { CalculationResult } from '../types';

interface ResultsData {
  generatedAt: string;
  totalIEMs: number;
  results: CalculationResult[];
}

export default function Home() {
  const [results, setResults] = useState<CalculationResult[] | null>(null);
  const [hpResults, setHpResults] = useState<CalculationResult[] | null>(null);
  const [activeType, setActiveType] = useState<'iem' | 'headphone'>('iem');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [totalIEMs, setTotalIEMs] = useState<number>(0);
  
  // Custom Ranking State
  const [customResult, setCustomResult] = useState<CalculationResult | null>(null);

  async function fetchResults(type: 'iem' | 'headphone'): Promise<ResultsData | null> {
    try {
      const file = type === 'iem' ? './data/results.json' : './data/results_hp.json';
      const response = await fetch(file);
      if (!response.ok) {
        if (type === 'headphone') return null; // HP might not exist yet
        throw new Error('Results not available yet');
      }
      return await response.json() as ResultsData;
    } catch (e) {
      console.warn(`Failed to load ${type} results`, e);
      return null;
    }
  }

  useEffect(() => {
    async function initLoad() {
      setLoading(true);
      try {
        const iemData = await fetchResults('iem');
        if (iemData) {
          setResults(iemData.results);
          setLastUpdate(iemData.generatedAt);
          setTotalIEMs(iemData.totalIEMs);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    initLoad();
  }, []);

  const handleTypeChange = async (type: 'iem' | 'headphone') => {
    setActiveType(type);
    setCustomResult(null); // Reset custom on switch
    
    if (type === 'headphone' && !hpResults) {
      setLoading(true);
      const data = await fetchResults('headphone');
      if (data) {
        setHpResults(data.results);
      }
      setLoading(false);
    }
  };

  if (loading && !results) { // Only full screen load on init
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
      
      <div className="type-tabs">
        <button 
          className={`tab-btn ${activeType === 'iem' ? 'active' : ''}`}
          onClick={() => handleTypeChange('iem')}
        >
          IEMs
        </button>
        <button 
          className={`tab-btn ${activeType === 'headphone' ? 'active' : ''}`}
          onClick={() => handleTypeChange('headphone')}
        >
          Headphones
        </button>
      </div>

      <TargetSubmission 
        onCalculate={setCustomResult} 
        isRanking={!!customResult}
      />
      
      <SimilarityList 
        results={customResult ? [customResult] : (activeType === 'iem' ? results : hpResults) || []} 
        isHeadphoneMode={activeType === 'headphone'}
      />
    </div>
  );
}
