import { useState, useEffect, useCallback } from 'react';
import { SimilarityList } from '../components/SimilarityList';
import { TargetPanel } from '../components/TargetPanel';
import { CATEGORY_DEFAULTS } from '../utils/shelfFilter';
import type {
  CalculationResult,
  LatestResultsData,
  CategoryFilter,
  TargetSelection,
  IEMTarget,
  KEMARTarget,
  HP5128Target,
  MeasurementMode,
  BuilderState,
  BuilderResults,
  BuilderParams,
} from '../types';

export default function Home() {
  // Latest tab state - separate data per category
  const [latestIemData, setLatestIemData] = useState<LatestResultsData | null>(null);
  const [latestKb5Data, setLatestKb5Data] = useState<LatestResultsData | null>(null);
  const [latest5128Data, setLatest5128Data] = useState<LatestResultsData | null>(null);
  const [latestIem5128Data, setLatestIem5128Data] = useState<LatestResultsData | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('iem');

  // OE/IE measurement mode toggle
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>('ie');

  // Target selection state - default to ISO/KEMAR DF/5128 DF
  const [targetSelection, setTargetSelection] = useState<TargetSelection>({
    iem: 'iso',
    hp_kb5: 'kemar',
    hp_5128: 'df'
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [totalIEMs, setTotalIEMs] = useState<number>(0);

  // Custom Upload Ranking State
  const [customResult, setCustomResult] = useState<CalculationResult | null>(null);

  // DF Target Builder State
  const [builderState, setBuilderState] = useState<BuilderState>({
    iem: { ...CATEGORY_DEFAULTS.iem },
    hp_kb5: { ...CATEGORY_DEFAULTS.hp_kb5 },
    hp_5128: { ...CATEGORY_DEFAULTS.hp_5128 },
    iem_5128: { ...CATEGORY_DEFAULTS.iem_5128 },
  });

  const [builderResults, setBuilderResults] = useState<BuilderResults>({
    iem: null,
    hp_kb5: null,
    hp_5128: null,
    iem_5128: null,
  });

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchLatestCategoryData = useCallback(async (
    category: CategoryFilter,
    iemTarget: IEMTarget,
    kemarTarget: KEMARTarget,
    hp5128Target: HP5128Target
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
          file = `./data/results_latest_hp_5128_${hp5128Target}.json`;
          break;
        case 'iem_5128':
          file = `./data/results_latest_iem_5128_${iemTarget}.json`;
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

  const loadAllLatestData = useCallback(async () => {
    setLoading(true);

    // Fetch all 4 categories so data is ready when toggling modes
    const [iemData, kb5Data, hp5128Data, iem5128Data] = await Promise.all([
      fetchLatestCategoryData('iem', targetSelection.iem, targetSelection.hp_kb5, targetSelection.hp_5128),
      fetchLatestCategoryData('hp_kb5', targetSelection.iem, targetSelection.hp_kb5, targetSelection.hp_5128),
      fetchLatestCategoryData('hp_5128', targetSelection.iem, targetSelection.hp_kb5, targetSelection.hp_5128),
      fetchLatestCategoryData('iem_5128', targetSelection.iem, targetSelection.hp_kb5, targetSelection.hp_5128),
    ]);

    setLatestIemData(iemData);
    setLatestKb5Data(kb5Data);
    setLatest5128Data(hp5128Data);
    setLatestIem5128Data(iem5128Data);

    const anyData = iemData || kb5Data || hp5128Data || iem5128Data;
    if (anyData) {
      setLastUpdate(anyData.generatedAt);
    }

    const currentData = categoryFilter === 'iem' ? iemData :
                        categoryFilter === 'hp_kb5' ? kb5Data :
                        categoryFilter === 'iem_5128' ? iem5128Data : hp5128Data;
    if (currentData) {
      setTotalIEMs(currentData.totalDevices);
    }

    setLoading(false);
  }, [fetchLatestCategoryData, targetSelection, categoryFilter]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Initial load
  useEffect(() => {
    async function initLoad() {
      setLoading(true);
      try {
        await loadAllLatestData();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    initLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload data when target selection changes
  useEffect(() => {
    loadAllLatestData();
  }, [targetSelection, loadAllLatestData]);

  // Update count when category filter changes
  useEffect(() => {
    const currentData = categoryFilter === 'iem' ? latestIemData :
                        categoryFilter === 'hp_kb5' ? latestKb5Data :
                        categoryFilter === 'iem_5128' ? latestIem5128Data : latest5128Data;
    if (currentData) {
      setTotalIEMs(currentData.totalDevices);
    }
  }, [categoryFilter, latestIemData, latestKb5Data, latest5128Data, latestIem5128Data]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleModeChange = (mode: MeasurementMode) => {
    setMeasurementMode(mode);

    // Reset mobile category filter if invalid for new mode
    if (mode === 'ie' && (categoryFilter === 'hp_kb5' || categoryFilter === 'hp_5128')) {
      setCategoryFilter('iem');
    }
    if (mode === 'oe' && (categoryFilter === 'iem' || categoryFilter === 'iem_5128')) {
      setCategoryFilter('hp_kb5');
    }
  };

  const handleTargetChange = (category: 'iem' | 'hp_kb5' | 'hp_5128', value: string) => {
    if (category === 'iem') {
      setTargetSelection(prev => ({ ...prev, iem: value as IEMTarget }));
    } else if (category === 'hp_kb5') {
      setTargetSelection(prev => ({ ...prev, hp_kb5: value as KEMARTarget }));
    } else {
      setTargetSelection(prev => ({ ...prev, hp_5128: value as HP5128Target }));
    }
  };

  // Builder handlers
  const handleBuilderParamsChange = (category: CategoryFilter, params: BuilderParams) => {
    setBuilderState(prev => ({ ...prev, [category]: params }));
  };

  const handleBuilderCalculate = (category: CategoryFilter, result: CalculationResult) => {
    setBuilderResults(prev => ({ ...prev, [category]: result }));
    // Clear upload-based custom result when builder produces results
    setCustomResult(null);
  };

  const handleBuilderReset = (category: CategoryFilter) => {
    setBuilderResults(prev => ({ ...prev, [category]: null }));
  };

  const handleUploadCalculate = (result: CalculationResult | null) => {
    setCustomResult(result);
  };

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const builderHasResults = {
    iem: builderResults.iem !== null,
    hp_kb5: builderResults.hp_kb5 !== null,
    hp_5128: builderResults.hp_5128 !== null,
    iem_5128: builderResults.iem_5128 !== null,
  };

  // For Latest tab: determine which categories should show builder results vs pre-scored
  const getLatestIemDevices = () => {
    if (builderResults.iem) return undefined;
    return latestIemData?.devices;
  };
  const getLatestKb5Devices = () => {
    if (builderResults.hp_kb5) return undefined;
    return latestKb5Data?.devices;
  };
  const getLatest5128Devices = () => {
    if (builderResults.hp_5128) return undefined;
    return latest5128Data?.devices;
  };
  const getLatestIem5128Devices = () => {
    if (builderResults.iem_5128) return undefined;
    return latestIem5128Data?.devices;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading && !latestIemData) {
    return (
      <div className="home">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || (!latestIemData && !latestKb5Data && !latest5128Data && !latestIem5128Data)) {
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
      <p className="subtitle">Latest Devices Preference Prediction Index Rankings</p>
      <div className="meta">
        <span>{totalIEMs.toLocaleString()} Devices scanned</span>
        {lastUpdate && (
          <span className="last-update">
            Updated {new Date(lastUpdate).toLocaleString()}
          </span>
        )}
      </div>

      {/* Target Selectors - Toggle Sliders */}
      <div className="target-selectors">
        {measurementMode === 'ie' && (
          <div className="target-toggle">
            <span className="target-label">IEM:</span>
            <div className="toggle-switch">
              <button
                className={`toggle-option ${targetSelection.iem === 'harman' ? 'active' : ''}`}
                onClick={() => handleTargetChange('iem', 'harman')}
              >
                Harman 2019
              </button>
              <button
                className={`toggle-option ${targetSelection.iem === 'iso' ? 'active' : ''}`}
                onClick={() => handleTargetChange('iem', 'iso')}
              >
                ISO 11904-2 DF
              </button>
            </div>
          </div>
        )}

        {measurementMode === 'oe' && (
          <>
            <div className="target-toggle">
              <span className="target-label">KB5:</span>
              <div className="toggle-switch">
                <button
                  className={`toggle-option ${targetSelection.hp_kb5 === 'harman' ? 'active' : ''}`}
                  onClick={() => handleTargetChange('hp_kb5', 'harman')}
                >
                  Harman 2018
                </button>
                <button
                  className={`toggle-option ${targetSelection.hp_kb5 === 'kemar' ? 'active' : ''}`}
                  onClick={() => handleTargetChange('hp_kb5', 'kemar')}
                >
                  KEMAR DF
                </button>
              </div>
            </div>

            <div className="target-toggle">
              <span className="target-label">5128:</span>
              <div className="toggle-switch">
                <button
                  className={`toggle-option ${targetSelection.hp_5128 === 'harman' ? 'active' : ''}`}
                  onClick={() => handleTargetChange('hp_5128', 'harman')}
                >
                  Harman 2018
                </button>
                <button
                  className={`toggle-option ${targetSelection.hp_5128 === 'df' ? 'active' : ''}`}
                  onClick={() => handleTargetChange('hp_5128', 'df')}
                >
                  5128 DF
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Category Filters - Mobile Only */}
      <div className="category-filters mobile-only">
        {measurementMode === 'ie' ? (
          <>
            <button
              className={`filter-btn ${categoryFilter === 'iem' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('iem')}
            >
              IEMs (711)
            </button>
            <button
              className={`filter-btn ${categoryFilter === 'iem_5128' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('iem_5128')}
            >
              5128 IE
            </button>
          </>
        ) : (
          <>
            <button
              className={`filter-btn ${categoryFilter === 'hp_kb5' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('hp_kb5')}
            >
              KB5 (711) OE
            </button>
            <button
              className={`filter-btn ${categoryFilter === 'hp_5128' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('hp_5128')}
            >
              B&K 5128 OE
            </button>
          </>
        )}
      </div>

      {/* Target Panel — Live Ranking */}
      <TargetPanel
        measurementMode={measurementMode}
        onModeChange={handleModeChange}
        builderState={builderState}
        builderHasResults={builderHasResults}
        onBuilderParamsChange={handleBuilderParamsChange}
        onBuilderCalculate={handleBuilderCalculate}
        onBuilderReset={handleBuilderReset}
        onUploadCalculate={handleUploadCalculate}
        isUploadRanking={!!customResult}
      />

      <SimilarityList
        results={customResult ? [customResult] : []}
        categoryFilter={categoryFilter}
        measurementMode={measurementMode}
        latestIemDevices={getLatestIemDevices()}
        latestKb5Devices={getLatestKb5Devices()}
        latest5128Devices={getLatest5128Devices()}
        latestIem5128Devices={getLatestIem5128Devices()}
        builderResults={builderResults}
      />
    </div>
  );
}
