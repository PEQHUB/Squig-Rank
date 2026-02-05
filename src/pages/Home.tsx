import { useState, useEffect } from 'react';
import { SimilarityList } from '../components/SimilarityList';
import { TargetSubmission } from '../components/TargetSubmission';
import type { CalculationResult, ActiveViewType, LatestResultsData, CategoryFilter, ResultsData } from '../types';

export default function Home() {
  const [results, setResults] = useState<CalculationResult[] | null>(null);
  const [hpKb5Results, setHpKb5Results] = useState<CalculationResult[] | null>(null);
  const [hp5128Results, setHp5128Results] = useState<CalculationResult[] | null>(null);
  const [latestResults, setLatestResults] = useState<LatestResultsData | null>(null);
  const [activeType, setActiveType] = useState<ActiveViewType>('latest');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('iem');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [totalIEMs, setTotalIEMs] = useState<number>(0);
  
  // Custom Ranking State
  const [customResult, setCustomResult] = useState<CalculationResult | null>(null);

  async function fetchResults(type: ActiveViewType): Promise<ResultsData | null> {
    try {
      let file: string;
      switch (type) {
        case 'latest':
          file = './data/results_latest.json';
          break;
        case 'iem':
          file = './data/results.json';
          break;
        case 'hp_kb5':
          file = './data/results_hp_kb5.json';
          break;
        case 'hp_5128':
          file = './data/results_hp_5128.json';
          break;
      }
      const response = await fetch(file);
      if (!response.ok) {
        if (type !== 'iem' && type !== 'latest') return null; // HP/Latest files might not exist yet
        throw new Error('Results not available yet');
      }
      return await response.json() as ResultsData;
    } catch (e) {
      console.warn(`Failed to load ${type} results`, e);
      return null;
    }
  }

  async function fetchLatestResults(): Promise<LatestResultsData | null> {
    try {
      const response = await fetch('./data/results_latest.json');
      if (!response.ok) {
        console.warn('Latest results not available yet');
        return null;
      }
      return await response.json() as LatestResultsData;
    } catch (e) {
      console.warn('Failed to load latest results', e);
      return null;
    }
  }

  useEffect(() => {
    async function initLoad() {
      setLoading(true);
      try {
        // Load latest tab by default
        const latestData = await fetchLatestResults();
        if (latestData) {
          setLatestResults(latestData);
          setLastUpdate(latestData.generatedAt);
          setTotalIEMs(latestData.totalDevices);
        } else {
          // Fallback to IEM tab if latest not available
          const iemData = await fetchResults('iem');
          if (iemData) {
            setResults(iemData.results);
            setLastUpdate(iemData.generatedAt);
            setTotalIEMs(iemData.totalIEMs);
            setActiveType('iem');
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    initLoad();
  }, []);

  const handleTypeChange = async (type: ActiveViewType) => {
    setActiveType(type);
    setCustomResult(null); // Reset custom on switch
    
    // Always load if not already loaded, and update total count
    setLoading(true);
    
    if (type === 'latest') {
      if (!latestResults) {
        const data = await fetchLatestResults();
        if (data) {
          setLatestResults(data);
          setTotalIEMs(data.totalDevices);
          setLastUpdate(data.generatedAt);
        }
      } else {
        setTotalIEMs(latestResults.totalDevices);
        setLastUpdate(latestResults.generatedAt);
      }
    } else {
      const data = await fetchResults(type);
      if (data) {
        switch (type) {
          case 'iem':
            setResults(data.results);
            break;
          case 'hp_kb5':
            setHpKb5Results(data.results);
            break;
          case 'hp_5128':
            setHp5128Results(data.results);
            break;
        }
        setTotalIEMs(data.totalIEMs);
        setLastUpdate(data.generatedAt);
      }
    }
    setLoading(false);
  };
  
  // Helper to get label for active type
  const getTypeLabel = (type: ActiveViewType): string => {
    switch (type) {
      case 'latest': return 'Latest Devices';
      case 'iem': return 'IEM';
      case 'hp_kb5': return 'KEMAR (711) OE Headphone';
      case 'hp_5128': return 'B&K 5128 OE Headphone';
    }
  };
  
  // Helper to get current results based on active type
  const getCurrentResults = (): CalculationResult[] | null => {
    switch (activeType) {
      case 'latest': return null; // Latest tab uses different data structure
      case 'iem': return results;
      case 'hp_kb5': return hpKb5Results;
      case 'hp_5128': return hp5128Results;
    }
  };

  if (loading && !results && !latestResults) { // Only full screen load on init
    return (
      <div className="home">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || (!results && !latestResults)) {
    return (
      <div className="home">
        <div className="error">
          <p>No scan results available yet.</p>
          <p className="error-detail">The scanner runs every 30 minutes. Check back soon!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      <p className="subtitle">{getTypeLabel(activeType)} Preference Prediction Index Rankings</p>
      <div className="meta">
        <span>{totalIEMs.toLocaleString()} {activeType === 'latest' ? 'Devices' : activeType === 'iem' ? 'IEMs' : 'Headphones'} scanned</span>
        {lastUpdate && (
          <span className="last-update">
            Updated {new Date(lastUpdate).toLocaleString()}
          </span>
        )}
      </div>
      
      <div className="type-tabs">
        <button 
          className={`tab-btn ${activeType === 'latest' ? 'active' : ''}`}
          onClick={() => handleTypeChange('latest')}
        >
          Latest
        </button>
        <button 
          className={`tab-btn ${activeType === 'iem' ? 'active' : ''}`}
          onClick={() => handleTypeChange('iem')}
        >
          IEMs
        </button>
        <button 
          className={`tab-btn ${activeType === 'hp_kb5' ? 'active' : ''}`}
          onClick={() => handleTypeChange('hp_kb5')}
        >
          KEMAR (711) OE
        </button>
        <button 
          className={`tab-btn ${activeType === 'hp_5128' ? 'active' : ''}`}
          onClick={() => handleTypeChange('hp_5128')}
        >
          B&K 5128 OE
        </button>
      </div>

      {activeType === 'latest' && (
        <div className="category-filters">
          <button
            className={`filter-btn ${categoryFilter === 'iem' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('iem')}
          >
            IEMs
          </button>
          <button
            className={`filter-btn ${categoryFilter === 'hp_kb5' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('hp_kb5')}
          >
            KEMAR (711) OE
          </button>
          <button
            className={`filter-btn ${categoryFilter === 'hp_5128' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('hp_5128')}
          >
            B&K 5128 OE
          </button>
        </div>
      )}

      {activeType !== 'latest' && (
        <TargetSubmission 
          onCalculate={setCustomResult} 
          isRanking={!!customResult}
          activeType={activeType}
        />
      )}
      
      <SimilarityList 
        results={customResult ? [customResult] : getCurrentResults() || []}
        latestDevices={activeType === 'latest' ? latestResults?.devices : undefined}
        isLatestTab={activeType === 'latest'}
        categoryFilter={categoryFilter}
      />
    </div>
  );
}
