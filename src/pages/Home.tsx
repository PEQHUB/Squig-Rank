import { useState, useEffect, useCallback } from 'react';
import { SimilarityList } from '../components/SimilarityList';
import { TargetSubmission } from '../components/TargetSubmission';
import type { CalculationResult, ActiveViewType, LatestResultsData, CategoryFilter, ResultsData, TargetSelection, IEMTarget, KEMARTarget } from '../types';

export default function Home() {
  const [results, setResults] = useState<CalculationResult[] | null>(null);
  const [hpKb5Results, setHpKb5Results] = useState<CalculationResult[] | null>(null);
  const [hp5128Results, setHp5128Results] = useState<CalculationResult[] | null>(null);
  
  // Latest tab state - separate data per category
  const [latestIemData, setLatestIemData] = useState<LatestResultsData | null>(null);
  const [latestKb5Data, setLatestKb5Data] = useState<LatestResultsData | null>(null);
  const [latest5128Data, setLatest5128Data] = useState<LatestResultsData | null>(null);
  
  const [activeType, setActiveType] = useState<ActiveViewType>('latest');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('iem');
  
  // Target selection state
  const [targetSelection, setTargetSelection] = useState<TargetSelection>({
    iem: 'harman',
    hp_kb5: 'harman'
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [totalIEMs, setTotalIEMs] = useState<number>(0);
  
  // Custom Ranking State
  const [customResult, setCustomResult] = useState<CalculationResult | null>(null);

  // Fetch standard results (for non-latest tabs)
  async function fetchResults(type: ActiveViewType): Promise<ResultsData | null> {
    try {
      let file: string;
      switch (type) {
        case 'latest':
          return null;
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
        if (type !== 'iem') return null;
        throw new Error('Results not available yet');
      }
      return await response.json() as ResultsData;
    } catch (e) {
      console.warn(`Failed to load ${type} results`, e);
      return null;
    }
  }

  // Fetch latest results for a specific category and target
  const fetchLatestCategoryData = useCallback(async (
    category: CategoryFilter, 
    iemTarget: IEMTarget, 
    kemarTarget: KEMARTarget
  ): Promise<LatestResultsData | null> => {
    try {
      let file: string;
      switch (category) {
        case 'iem':
          file = `./data/results_latest_iem_${iemTarget}.json`;
          break;
        case 'hp_kb5':
          file = `./data/results_latest_hp_kb5_${kemarTarget}.json`;
          break;
        case 'hp_5128':
          file = './data/results_latest_hp_5128.json';
          break;
      }
      const response = await fetch(file);
      if (!response.ok) {
        console.warn(`Latest ${category} results not available yet`);
        return null;
      }
      return await response.json() as LatestResultsData;
    } catch (e) {
      console.warn(`Failed to load latest ${category} results`, e);
      return null;
    }
  }, []);

  // Load all latest data for the three categories
  const loadAllLatestData = useCallback(async () => {
    setLoading(true);
    
    const [iemData, kb5Data, hp5128Data] = await Promise.all([
      fetchLatestCategoryData('iem', targetSelection.iem, targetSelection.hp_kb5),
      fetchLatestCategoryData('hp_kb5', targetSelection.iem, targetSelection.hp_kb5),
      fetchLatestCategoryData('hp_5128', targetSelection.iem, targetSelection.hp_kb5)
    ]);
    
    setLatestIemData(iemData);
    setLatestKb5Data(kb5Data);
    setLatest5128Data(hp5128Data);
    
    // Set meta info from whichever data loaded
    const anyData = iemData || kb5Data || hp5128Data;
    if (anyData) {
      setLastUpdate(anyData.generatedAt);
    }
    
    // Update total count based on current category
    const currentData = categoryFilter === 'iem' ? iemData : 
                        categoryFilter === 'hp_kb5' ? kb5Data : hp5128Data;
    if (currentData) {
      setTotalIEMs(currentData.totalDevices);
    }
    
    setLoading(false);
  }, [fetchLatestCategoryData, targetSelection, categoryFilter]);

  // Initial load
  useEffect(() => {
    async function initLoad() {
      setLoading(true);
      try {
        // Load latest tab data by default
        await loadAllLatestData();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        
        // Fallback to IEM tab if latest not available
        const iemData = await fetchResults('iem');
        if (iemData) {
          setResults(iemData.results);
          setLastUpdate(iemData.generatedAt);
          setTotalIEMs(iemData.totalIEMs);
          setActiveType('iem');
        }
      } finally {
        setLoading(false);
      }
    }
    initLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload data when target selection changes (for latest tab)
  useEffect(() => {
    if (activeType === 'latest') {
      loadAllLatestData();
    }
  }, [targetSelection, activeType, loadAllLatestData]);

  // Update count when category filter changes
  useEffect(() => {
    if (activeType === 'latest') {
      const currentData = categoryFilter === 'iem' ? latestIemData : 
                          categoryFilter === 'hp_kb5' ? latestKb5Data : latest5128Data;
      if (currentData) {
        setTotalIEMs(currentData.totalDevices);
      }
    }
  }, [categoryFilter, activeType, latestIemData, latestKb5Data, latest5128Data]);

  const handleTypeChange = async (type: ActiveViewType) => {
    setActiveType(type);
    setCustomResult(null);
    
    if (type === 'latest') {
      // Data already loaded via useEffect
      const currentData = categoryFilter === 'iem' ? latestIemData : 
                          categoryFilter === 'hp_kb5' ? latestKb5Data : latest5128Data;
      if (currentData) {
        setTotalIEMs(currentData.totalDevices);
        setLastUpdate(currentData.generatedAt);
      }
    } else {
      setLoading(true);
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
      setLoading(false);
    }
  };

  const handleTargetChange = (category: 'iem' | 'hp_kb5', value: string) => {
    if (category === 'iem') {
      setTargetSelection(prev => ({ ...prev, iem: value as IEMTarget }));
    } else {
      setTargetSelection(prev => ({ ...prev, hp_kb5: value as KEMARTarget }));
    }
  };
  
  const getTypeLabel = (type: ActiveViewType): string => {
    switch (type) {
      case 'latest': return 'Latest Devices';
      case 'iem': return 'IEM';
      case 'hp_kb5': return 'KEMAR (711) OE Headphone';
      case 'hp_5128': return 'B&K 5128 OE Headphone';
    }
  };
  
  const getCurrentResults = (): CalculationResult[] | null => {
    switch (activeType) {
      case 'latest': return null;
      case 'iem': return results;
      case 'hp_kb5': return hpKb5Results;
      case 'hp_5128': return hp5128Results;
    }
  };



  if (loading && !results && !latestIemData) {
    return (
      <div className="home">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || (!results && !latestIemData && !latestKb5Data && !latest5128Data)) {
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
        <>
          {/* Target Selectors */}
          <div className="target-selectors">
            <div className="target-selector">
              <label>IEM Target:</label>
              <select 
                value={targetSelection.iem}
                onChange={(e) => handleTargetChange('iem', e.target.value)}
              >
                <option value="harman">Harman 2019</option>
                <option value="iso">ISO 11904-2 DF</option>
              </select>
            </div>
            
            <div className="target-selector">
              <label>KEMAR Target:</label>
              <select
                value={targetSelection.hp_kb5}
                onChange={(e) => handleTargetChange('hp_kb5', e.target.value)}
              >
                <option value="harman">Harman 2018</option>
                <option value="kemar">KEMAR DF (Tilted)</option>
              </select>
            </div>
          </div>

          {/* Category Filters - Mobile Only */}
          <div className="category-filters mobile-only">
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
        </>
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
        isLatestTab={activeType === 'latest'}
        categoryFilter={categoryFilter}
        latestIemDevices={activeType === 'latest' ? latestIemData?.devices : undefined}
        latestKb5Devices={activeType === 'latest' ? latestKb5Data?.devices : undefined}
        latest5128Devices={activeType === 'latest' ? latest5128Data?.devices : undefined}
      />
    </div>
  );
}
