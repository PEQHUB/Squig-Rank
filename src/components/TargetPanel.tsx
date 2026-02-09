import { useState, useEffect } from 'react';
import { DFTargetBuilder } from './DFTargetBuilder';
import { TargetSubmission } from './TargetSubmission';
import type {
  BuilderParams,
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
  builderHasResults: { iem: boolean; hp_kb5: boolean; hp_5128: boolean; iem_5128: boolean };
  onBuilderParamsChange: (category: CategoryFilter, params: BuilderParams) => void;
  onBuilderCalculate: (category: CategoryFilter, result: CalculationResult) => void;
  onBuilderReset: (category: CategoryFilter) => void;
  onUploadCalculate: (result: CalculationResult | null) => void;
  isUploadRanking: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TargetPanel({
  measurementMode,
  onModeChange,
  builderState,
  builderHasResults,
  onBuilderParamsChange,
  onBuilderCalculate,
  onBuilderReset,
  onUploadCalculate,
  isUploadRanking,
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

  const currentParams = builderState[effectiveCategory];
  const currentHasResults = builderHasResults[effectiveCategory];

  return (
    <div className="target-panel">
      {/* Header row: title + mode toggle + tabs */}
      <div className="target-panel-header">
        <h3>Live Ranking</h3>

        <div className="header-controls">
          {/* OE/IE Mode Toggle */}
          <div className="mode-toggle-inline">
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
          <div className="category-picker-inline">
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

      {/* Tab Content */}
      {activeTab === 'build' ? (
        <div className="panel-content">

          <DFTargetBuilder
            category={effectiveCategory}
            params={currentParams}
            onParamsChange={(p) => onBuilderParamsChange(effectiveCategory, p)}
            onCalculate={onBuilderCalculate}
            onReset={onBuilderReset}
            isRanking={currentHasResults}
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
