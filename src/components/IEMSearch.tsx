import { useState, useEffect, useRef, useCallback } from 'react';
import { loadCurveData } from '../utils/scoring';
import type { LoadedCurveData } from '../utils/scoring';
import { scoreAllDevices } from '../utils/scoring';
import type { CalculationResult, CategoryFilter, MeasurementMode } from '../types';
import type { FindSimilarDevice } from '../pages/Home';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  onCalculate: (result: CalculationResult | null) => void;
  isRanking: boolean;
  category: CategoryFilter;
  measurementMode: MeasurementMode;
  externalDevice?: FindSimilarDevice | null;
}

interface SelectedDevice {
  id: string;
  name: string;
  rig: '711' | '5128';
  type: 'iem' | 'headphone';
  db: number[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function IEMSearch({ onCalculate, isRanking, category, measurementMode, externalDevice }: Props) {
  const [query, setQuery] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<SelectedDevice | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allEntries, setAllEntries] = useState<LoadedCurveData['entries'] | null>(null);
  const [frequencies, setFrequencies] = useState<number[] | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Load curve data on mount
  useEffect(() => {
    loadCurveData().then(data => {
      setAllEntries(data.entries);
      setFrequencies(data.frequencies);
    });
  }, []);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Filter entries for autocomplete
  const filteredEntries = (() => {
    if (!allEntries || !debouncedQuery.trim()) return [];

    const q = debouncedQuery.toLowerCase();
    const typeFilter = measurementMode === 'ie' ? 'iem' : 'headphone';

    const matches = allEntries.filter(e =>
      e.type === typeFilter && e.name.toLowerCase().includes(q)
    );

    // Sort: exact start match first, then alphabetical
    matches.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });

    return matches.slice(0, 50);
  })();

  // Score against selected device
  const handleScore = useCallback(async (device: SelectedDevice) => {
    if (!frequencies) return;

    setLoading(true);
    try {
      const targetCurve = { frequencies, db: device.db };
      const targetType = device.rig;

      const result = await scoreAllDevices(targetCurve, targetType, category, device.name);

      // Filter out the reference device itself
      result.ranked = result.ranked.filter(r => r.id !== device.id);

      onCalculate(result);
    } catch (err) {
      console.error('Similarity scoring failed:', err);
    } finally {
      setLoading(false);
    }
  }, [frequencies, category, onCalculate]);

  // Handle device selection
  const handleSelect = (entry: LoadedCurveData['entries'][0]) => {
    const device: SelectedDevice = {
      id: entry.id,
      name: entry.name,
      rig: entry.rig,
      type: entry.type,
      db: entry.db,
    };
    setSelectedDevice(device);
    setQuery(entry.name);
    setShowDropdown(false);
    handleScore(device);
  };

  // Auto-re-rank when category changes
  useEffect(() => {
    if (selectedDevice && isRanking) {
      handleScore(selectedDevice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Handle external device selection (from "Find Similar" button in list)
  const prevExternalRef = useRef<FindSimilarDevice | null>(null);
  useEffect(() => {
    if (!externalDevice || !frequencies) return;
    // Only trigger if the external device actually changed
    if (prevExternalRef.current?.id === externalDevice.id) return;
    prevExternalRef.current = externalDevice;

    const device: SelectedDevice = {
      id: externalDevice.id,
      name: externalDevice.name,
      rig: externalDevice.rig,
      type: 'iem', // Find Similar is always from a scored result
      db: externalDevice.db,
    };
    setSelectedDevice(device);
    setQuery(externalDevice.name);
    setShowDropdown(false);
    handleScore(device);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDevice, frequencies]);

  // Clear selection
  const handleClear = () => {
    setSelectedDevice(null);
    setQuery('');
    onCalculate(null);
  };

  // Get display info
  const getSourceDomain = (id: string) => id.split('::')[0];
  const getRigLabel = (entry: { rig: string; pinna: string | null }) => {
    if (entry.pinna === 'kb5') return 'KB5';
    if (entry.pinna === '5128' || entry.rig === '5128') return '5128';
    return '711';
  };

  return (
    <div className="iem-search">
      <div className="iem-search-input-wrapper" ref={wrapperRef}>
        <span className="iem-search-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          className="iem-search-input"
          placeholder={measurementMode === 'ie' ? 'Search IEMs...' : 'Search headphones...'}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setShowDropdown(true);
            if (selectedDevice) {
              setSelectedDevice(null);
              onCalculate(null);
            }
          }}
          onFocus={() => {
            if (query.trim()) setShowDropdown(true);
          }}
        />

        {/* Autocomplete dropdown */}
        {showDropdown && filteredEntries.length > 0 && (
          <div className="iem-search-dropdown">
            {filteredEntries.map(entry => (
              <button
                key={entry.id}
                className="iem-search-item"
                onClick={() => handleSelect(entry)}
              >
                <span className="iem-search-item-name">{entry.name}</span>
                <span className="iem-search-item-meta">
                  <span className={`iem-search-rig-badge rig-${entry.rig}`}>
                    {getRigLabel(entry)}
                  </span>
                  <span className="iem-search-item-domain">
                    {getSourceDomain(entry.id)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* No results message */}
        {showDropdown && debouncedQuery.trim() && filteredEntries.length === 0 && allEntries && (
          <div className="iem-search-dropdown">
            <div className="iem-search-no-results">No matches found</div>
          </div>
        )}
      </div>

      {/* Selected device + actions */}
      {selectedDevice && (
        <div className="iem-search-selected">
          <div className="iem-search-selected-info">
            <span className="iem-search-selected-label">Comparing to:</span>
            <span className="iem-search-selected-name">{selectedDevice.name}</span>
            <span className={`iem-search-rig-badge rig-${selectedDevice.rig}`}>
              {selectedDevice.rig === '5128' ? '5128' : '711'}
            </span>
          </div>
          <div className="iem-search-actions">
            <button className="reset-btn" onClick={handleClear}>Clear</button>
            <button
              className="submit-btn"
              onClick={() => handleScore(selectedDevice)}
              disabled={loading}
            >
              {loading ? 'Ranking...' : 'Re-Rank'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
