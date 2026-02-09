import { useState, useEffect, useRef } from 'react';
import { parseFrequencyResponse } from '../utils/ppi';
import { scoreAllDevices } from '../utils/scoring';
import type { CalculationResult, CategoryFilter } from '../types';

// ============================================================================
// COMPONENT
// ============================================================================

interface Props {
  onCalculate: (results: CalculationResult | null) => void;
  isRanking: boolean;
  category: CategoryFilter;
}

export function TargetSubmission({ onCalculate, isRanking, category }: Props) {
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

      // 2. Score all devices using shared pipeline
      // Map category to the activeType expected by scoreAllDevices
      const result = await scoreAllDevices(
        parsedTarget,
        targetType,
        category,
        targetName
      );

      onCalculate(result);

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
  }, [targetType, category]);

  // Determine active view label
  const viewLabel = category === 'iem' ? 'IEMs' :
                    category === 'iem_5128' ? 'B&K 5128 IEMs' :
                    category === 'hp_kb5' ? 'KB5 (711) OE Headphones' :
                    'B&K 5128 OE Headphones';

  const isIemCategory = category === 'iem' || category === 'iem_5128';

  return (
    <div className="custom-target-upload">
      <p className="subtitle" style={{marginBottom: '12px'}}>
        Paste your custom target curve to instantly rank all {viewLabel}.
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
          {isIemCategory && (
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
          )}
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
          {loading ? 'Ranking...' : (isRanking ? 'Update Rankings' : `Rank All ${isIemCategory ? 'IEMs' : 'Headphones'}`)}
        </button>
      </div>
    </div>
  );
}
