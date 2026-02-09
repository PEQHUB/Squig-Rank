import { useState, useEffect } from 'react';
import { DFTargetBuilder } from './DFTargetBuilder';
import { TargetSubmission } from './TargetSubmission';
import type {
  BuilderParams,
  BuilderResults,
  BuilderState,
  CalculationResult,
  CategoryFilter,
  MeasurementMode,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

type PanelTab = 'build' | 'upload';

interface Props {
  measurementMode: MeasurementMode;
  onModeChange: (mode: MeasurementMode) => void;
  builderState: BuilderState;
  builderResults: BuilderResults;
  onBuilderParamsChange: (category: CategoryFilter, params: BuilderParams) => void;
  onBuilderCalculate: (category: CategoryFilter, result: CalculationResult) => void;
  onBuilderReset: (category: CategoryFilter) => void;
  onUploadCalculate: (result: CalculationResult | null) => void;
  customResult: CalculationResult | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TargetPanel({
  measurementMode,
  onModeChange,
  builderState,
  builderResults,
  onBuilderParamsChange,
  onBuilderCalculate,
  onBuilderReset,
  onUploadCalculate,
  customResult,
}: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('build');

  // Category picker for the builder
  const [builderCategory, setBuilderCategory] = useState<CategoryFilter>('iem');

  // Reset builder category when measurement mode changes and current is invalid
  useEffect(() => {
    if (measurementMode === 'ie' && (builderCategory === 'hp_kb5' || builderCategory === 'hp_5128')) {
      setBuilderCategory('iem');
    }
    if (measurementMode === 'oe' && (builderCategory === 'iem' || builderCategory === 'iem_5128')) {
      setBuilderCategory('hp_kb5');
    }
  }, [measurementMode]);

  const effectiveCategory: CategoryFilter = builderCategory;

  const siblingCategory: CategoryFilter = measurementMode === 'ie'
    ? (effectiveCategory === 'iem' ? 'iem_5128' : 'iem')
    : (effectiveCategory === 'hp_kb5' ? 'hp_5128' : 'hp_kb5');
  const siblingParams = builderState[siblingCategory];
  const siblingHasResults = builderResults[siblingCategory] !== null;

  const currentParams = builderState[effectiveCategory];
  const currentHasResults = builderResults[effectiveCategory] !== null;
  const isUploadRanking = customResult !== null;

  // Determine active ranking indicator text
  const activeRankingName = (() => {
    if (activeTab === 'build' && currentHasResults) {
      return builderResults[effectiveCategory]?.targetName ?? null;
    }
    if (activeTab === 'upload' && isUploadRanking) {
      return customResult?.targetName ?? null;
    }
    return null;
  })();

  return (
    <div className="target-panel">
      {/* Header row: title + labeled toggle groups */}
      <div className="target-panel-header">
        <h3>Live Ranking</h3>

        <div className="header-controls">
          {/* OE/IE Mode Toggle */}
          <div className="labeled-toggle">
            <span className="toggle-label">Type</span>
            <div className="toggle-switch">
              <button
                className={`toggle-option ${measurementMode === 'ie' ? 'active' : ''}`}
                onClick={() => onModeChange('ie')}
              >
                In-Ear
              </button>
              <button
                className={`toggle-option ${measurementMode === 'oe' ? 'active' : ''}`}
                onClick={() => onModeChange('oe')}
              >
                Over-Ear
              </button>
            </div>
          </div>

          {/* Category picker — always visible */}
          <div className="labeled-toggle">
            <span className="toggle-label">Rig</span>
            <div className="toggle-switch">
              {measurementMode === 'ie' ? (
                <>
                  <button
                    className={`toggle-option ${builderCategory === 'iem' ? 'active' : ''}`}
                    onClick={() => setBuilderCategory('iem')}
                  >
                    711
                  </button>
                  <button
                    className={`toggle-option ${builderCategory === 'iem_5128' ? 'active' : ''}`}
                    onClick={() => setBuilderCategory('iem_5128')}
                  >
                    5128
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`toggle-option ${builderCategory === 'hp_kb5' ? 'active' : ''}`}
                    onClick={() => setBuilderCategory('hp_kb5')}
                  >
                    KB5
                  </button>
                  <button
                    className={`toggle-option ${builderCategory === 'hp_5128' ? 'active' : ''}`}
                    onClick={() => setBuilderCategory('hp_5128')}
                  >
                    5128
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Build / Upload Tab Switcher */}
          <div className="labeled-toggle">
            <span className="toggle-label">Mode</span>
            <div className="target-panel-tabs">
              <button
                className={`panel-tab ${activeTab === 'build' ? 'active' : ''}`}
                onClick={() => setActiveTab('build')}
              >
                Build
              </button>
              <button
                className={`panel-tab ${activeTab === 'upload' ? 'active' : ''}`}
                onClick={() => setActiveTab('upload')}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Active ranking indicator */}
      {activeRankingName && (
        <div className="ranking-indicator">
          <span className="ranking-indicator-dot" />
          Ranking by: {activeRankingName}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'build' ? (
        <div className="panel-content">

          <DFTargetBuilder
            category={effectiveCategory}
            siblingCategory={siblingCategory}
            siblingParams={siblingParams}
            params={currentParams}
            onParamsChange={(p) => onBuilderParamsChange(effectiveCategory, p)}
            onCalculate={onBuilderCalculate}
            onReset={onBuilderReset}
            isRanking={currentHasResults}
            isSiblingRanking={siblingHasResults}
          />
        </div>
      ) : (
        <div className="panel-content">
          <TargetSubmission
            onCalculate={onUploadCalculate}
            isRanking={isUploadRanking}
            category={effectiveCategory}
          />
        </div>
      )}
    </div>
  );
}
