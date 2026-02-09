import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Track which target selections have been loaded to avoid redundant fetches
  const loadedTargetsRef = useRef<Record<string, string>>({});

  const loadCategoryData = useCallback(async (category: CategoryFilter) => {
    const targetKey = category === 'iem' || category === 'iem_5128'
      ? targetSelection.iem
      : category === 'hp_kb5'
        ? targetSelection.hp_kb5
        : targetSelection.hp_5128;
    const cacheKey = `${category}:${targetKey}`;

    // Skip if already loaded with same target
    if (loadedTargetsRef.current[category] === cacheKey) return;

    const data = await fetchLatestCategoryData(category, targetSelection.iem, targetSelection.hp_kb5, targetSelection.hp_5128);
    loadedTargetsRef.current[category] = cacheKey;

    switch (category) {
      case 'iem': setLatestIemData(data); break;
      case 'hp_kb5': setLatestKb5Data(data); break;
      case 'hp_5128': setLatest5128Data(data); break;
      case 'iem_5128': setLatestIem5128Data(data); break;
    }

    if (data) {
      setLastUpdate(data.generatedAt);
      setTotalIEMs(data.totalDevices);
    }
  }, [fetchLatestCategoryData, targetSelection]);

  const loadAllLatestData = useCallback(async () => {
    setLoading(true);

    // Load active category first for fast initial render
    if (measurementMode === 'ie') {
      await loadCategoryData('iem');
      // Load the sibling column in background
      loadCategoryData('iem_5128');
    } else {
      await loadCategoryData('hp_kb5');
      loadCategoryData('hp_5128');
    }

    setLoading(false);
  }, [loadCategoryData, measurementMode]);

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

  // Reload data when target selection changes — only re-fetch affected categories
  useEffect(() => {
    // Invalidate cache so changed targets get re-fetched
    loadedTargetsRef.current = {};
    const loadData = async () => {
      if (measurementMode === 'ie') {
        await Promise.all([loadCategoryData('iem'), loadCategoryData('iem_5128')]);
      } else {
        await Promise.all([loadCategoryData('hp_kb5'), loadCategoryData('hp_5128')]);
      }
    };
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSelection]);

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

  const handleModeChange = async (mode: MeasurementMode) => {
    setMeasurementMode(mode);

    // Reset mobile category filter if invalid for new mode
    if (mode === 'ie' && (categoryFilter === 'hp_kb5' || categoryFilter === 'hp_5128')) {
      setCategoryFilter('iem');
    }
    if (mode === 'oe' && (categoryFilter === 'iem' || categoryFilter === 'iem_5128')) {
      setCategoryFilter('hp_kb5');
    }

    // Load both categories for the new mode in parallel
    if (mode === 'ie') {
      await Promise.all([loadCategoryData('iem'), loadCategoryData('iem_5128')]);
    } else {
      await Promise.all([loadCategoryData('hp_kb5'), loadCategoryData('hp_5128')]);
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

  // Unified OE target toggle — sets both KB5 and 5128 targets at once
  const handleOETargetToggle = (mode: 'harman' | 'df') => {
    setTargetSelection(prev => ({
      ...prev,
      hp_kb5: mode === 'harman' ? 'harman' : 'kemar',
      hp_5128: mode === 'harman' ? 'harman' : 'df',
    }));
  };

  const oeTargetMode: 'harman' | 'df' = targetSelection.hp_kb5 === 'harman' ? 'harman' : 'df';

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
    if (result) {
      // Clear all builder results to avoid confusion — only one ranking source at a time
      setBuilderResults({ iem: null, hp_kb5: null, hp_5128: null, iem_5128: null });
    }
  };

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

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

  const primaryData = measurementMode === 'ie' ? latestIemData : latestKb5Data;
  if (loading && !primaryData) {
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
        <div className="target-toggle">
          <span className="target-label">
            {measurementMode === 'ie' ? 'In-Ear Target Type' : 'Over-Ear Target Type'}
          </span>
          <div className="toggle-switch">
            {measurementMode === 'ie' ? (
              <>
                <button
                  className={`toggle-option ${targetSelection.iem === 'harman' ? 'active' : ''}`}
                  onClick={() => handleTargetChange('iem', 'harman')}
                >
                  Harman
                </button>
                <button
                  className={`toggle-option ${targetSelection.iem === 'iso' ? 'active' : ''}`}
                  onClick={() => handleTargetChange('iem', 'iso')}
                >
                  DF
                </button>
              </>
            ) : (
              <>
                <button
                  className={`toggle-option ${oeTargetMode === 'harman' ? 'active' : ''}`}
                  onClick={() => handleOETargetToggle('harman')}
                >
                  Harman
                </button>
                <button
                  className={`toggle-option ${oeTargetMode === 'df' ? 'active' : ''}`}
                  onClick={() => handleOETargetToggle('df')}
                >
                  DF
                </button>
              </>
            )}
          </div>
        </div>
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
        builderResults={builderResults}
        onBuilderParamsChange={handleBuilderParamsChange}
        onBuilderCalculate={handleBuilderCalculate}
        onBuilderReset={handleBuilderReset}
        onUploadCalculate={handleUploadCalculate}
        customResult={customResult}
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
