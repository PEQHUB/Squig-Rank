import { useState } from 'react';
import type { CalculationResult, ScoredIEM } from '../types';

const PAGE_SIZE = 25;

export default function SimilarityList({ results, isHeadphoneMode = false }: { results: CalculationResult[], isHeadphoneMode?: boolean }) {
  const [activeColumn, setActiveColumn] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for filters
  const [showCloneCoupler, setShowCloneCoupler] = useState(results.map(() => true));
  const [hideDuplicates, setHideDuplicates] = useState(results.map(() => true));
  
  // Headphone specific filters
  const [pinnaFilters, setPinnaFilters] = useState(results.map(() => 'all'));

  // Track how many items to show per column
  const [showCounts, setShowCounts] = useState(
    results.map(() => PAGE_SIZE)
  );

  const isMobile = window.innerWidth <= 768;

  const handleNext = () => {
    setActiveColumn((prev) => (prev + 1) % results.length);
  };

  const handlePrev = () => {
    setActiveColumn((prev) => (prev - 1 + results.length) % results.length);
  };

  const toggleCloneCoupler = (targetIndex: number) => {
    setShowCloneCoupler(prev => {
      const newFilters = [...prev];
      newFilters[targetIndex] = !newFilters[targetIndex];
      return newFilters;
    });
  };
  
  const toggleDuplicates = (targetIndex: number) => {
    setHideDuplicates(prev => {
      const newFilters = [...prev];
      newFilters[targetIndex] = !newFilters[targetIndex];
      return newFilters;
    });
  };

  const handlePinnaChange = (targetIndex: number, value: string) => {
    setPinnaFilters(prev => {
      const newFilters = [...prev];
      newFilters[targetIndex] = value;
      return newFilters;
    });
  };

  const handleLoadMore = (targetIndex: number) => {
    setShowCounts(prev => {
      const newCounts = [...prev];
      newCounts[targetIndex] += PAGE_SIZE;
      return newCounts;
    });
  };

  return (
    <div className="similarity-list">
      <div className="search-container">
        <span className="search-icon">🔍</span>
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search by model name..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isMobile ? (
        <div className="mobile-view">
          <button onClick={handlePrev} className="nav-button">&#9664;</button>
          <TargetColumn
            data={results[activeColumn]}
            showCloneCoupler={showCloneCoupler[activeColumn]}
            hideDuplicates={hideDuplicates[activeColumn]}
            pinnaFilter={isHeadphoneMode ? pinnaFilters[activeColumn] : undefined}
            searchTerm={searchTerm}
            onPinnaChange={(val) => handlePinnaChange(activeColumn, val)}
            onToggleClone={() => toggleCloneCoupler(activeColumn)}
            onToggleDupes={() => toggleDuplicates(activeColumn)}
            showCount={showCounts[activeColumn]}
            onLoadMore={() => handleLoadMore(activeColumn)}
          />
          <button onClick={handleNext} className="nav-button">&#9654;</button>
        </div>
      ) : (
        <div className="desktop-view">
          {results.map((result, index) => (
            <TargetColumn
              key={result.targetName}
              data={result}
              showCloneCoupler={showCloneCoupler[index]}
              hideDuplicates={hideDuplicates[index]}
              pinnaFilter={isHeadphoneMode ? pinnaFilters[index] : undefined}
              searchTerm={searchTerm}
              onPinnaChange={(val) => handlePinnaChange(index, val)}
              onToggleClone={() => toggleCloneCoupler(index)}
              onToggleDupes={() => toggleDuplicates(index)}
              showCount={showCounts[index]}
              onLoadMore={() => handleLoadMore(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}


function getSquigUrl(iem: ScoredIEM): string {
  // id format is "subdomain::filename"
  const [subdomain, fileName] = iem.id.split('::');
  
  // Handle special domain overrides
  if (subdomain === 'crinacle') {
    return `https://graph.hangout.audio/iem/711/?share=${encodeURIComponent(fileName)}`;
  }
  if (subdomain === 'superreview') {
    return `https://squig.link/?share=${encodeURIComponent(fileName)}`;
  }
  if (subdomain === 'den-fi') {
    return `https://ish.squig.link/?share=${encodeURIComponent(fileName)}`;
  }
  if (subdomain === 'paulwasabii' || subdomain === 'pw') {
    return `https://pw.squig.link/?share=${encodeURIComponent(fileName)}`;
  }
  
  return `https://${subdomain}.squig.link/?share=${encodeURIComponent(fileName)}`;
}

interface TargetColumnProps {
  data: CalculationResult;
  showCloneCoupler: boolean;
  hideDuplicates: boolean;
  pinnaFilter?: string;
  searchTerm?: string;
  onPinnaChange?: (value: string) => void;
  onToggleClone: () => void;
  onToggleDupes: () => void;
  showCount: number;
  onLoadMore: () => void;
}

function TargetColumn({ 
  data, 
  showCloneCoupler, 
  hideDuplicates,
  pinnaFilter,
  searchTerm,
  onPinnaChange,
  onToggleClone, 
  onToggleDupes,
  showCount, 
  onLoadMore 
}: TargetColumnProps) {
  
  // 1. Filter by Quality (Clone Coupler)
  const allItems = data.ranked || [];
  let filteredItems = showCloneCoupler 
    ? allItems 
    : allItems.filter(iem => iem.quality === 'high');

  // 1.2 Filter by Search Term
  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.toLowerCase().trim();
    filteredItems = filteredItems.filter(item => 
      item.name.toLowerCase().includes(term)
    );
  }

  // 1.5 Filter by Pinna (Headphones only)
  if (pinnaFilter && pinnaFilter !== 'all') {
    filteredItems = filteredItems.filter(item => {
        // If 5128 pinna filter selected, match 5128 rig OR 5128 pinna
        if (pinnaFilter === '5128') return item.pinna === '5128' || item.rig === '5128';
        return item.pinna === pinnaFilter;
    });
  }

  // 2. Filter Duplicates (if enabled)
  if (hideDuplicates) {
    const seen = new Map<string, ScoredIEM>();
    
    // Sort logic to prioritize High Quality when deduping
    // We already have them sorted by score from backend, but we want to ensure
    // we pick the "High Quality" version if scores are similar or identical.
    // Ideally, we iterate and if we find a better version of an existing key, we replace it.
    
    for (const item of filteredItems) {
      const normalizedName = item.name.toLowerCase().trim();
      // Default to '711' if rig is undefined to ensure we have a valid key
      const rigKey = item.rig || '711';
      // Composite key to allow one entry per rig type per device
      const key = `${normalizedName}::${rigKey}`;
      
      const existing = seen.get(key);
      
      if (!existing) {
        seen.set(key, item);
      } else {
        // If we have an existing one, should we replace it?
        // Logic: prioritize keeping the highest scoring copy.
        // Since the list is sorted by score descending, 'existing' (first seen) usually has higher score.
        // We only replace if 'item' has a strictly higher score (unlikely due to sort)
        // OR if scores are equal/very close, we prefer High Quality as a tiebreaker.
        
        const scoreDiff = item.similarity - existing.similarity;
        
        if (scoreDiff > 0.0001) {
            // New item has higher score (unexpected given sort, but safe to handle)
            seen.set(key, item);
        } else if (Math.abs(scoreDiff) < 0.0001) {
            // Scores are essentially equal
            // Prefer High Quality if existing is Low Quality
            if (item.quality === 'high' && existing.quality !== 'high') {
                seen.set(key, item);
            }
        }
      }
    }
    
    // Convert back to array (and ensure order is maintained or re-sorted)
    // Since Map iterates in insertion order, and we inserted in score order,
    // we should be mostly fine, but let's re-sort to be safe.
    filteredItems = Array.from(seen.values()).sort((a, b) => b.similarity - a.similarity);
  }
  
  // Slice to current show count
  const displayedItems = filteredItems.slice(0, showCount);
  const hasMore = filteredItems.length > showCount;
  const totalAvailable = filteredItems.length;

  return (
    <div className="target-column">
      <h2>{data.targetName}</h2>
      
      <div className="target-downloads">
        {data.targetFiles && data.targetFiles['711'] && (
          <a href={`targets/${data.targetFiles['711']}`} download className="target-download-btn" title="Download 711 Target">
            711 Target
          </a>
        )}
        {data.targetFiles && data.targetFiles['5128'] && (
          <a href={`targets/${data.targetFiles['5128']}`} download className="target-download-btn" title="Download 5128 Target">
            5128 Target
          </a>
        )}
        {!data.targetFiles && data.targetFileName && (
           <a href={`targets/${data.targetFileName}`} download className="target-download-btn">
             Download Target
           </a>
        )}
      </div>

      <div className="filter-controls">
        {/* Clone Coupler Toggle */}
        <div 
          className={`toggle-pill clone-toggle ${showCloneCoupler ? 'active' : ''}`}
          onClick={onToggleClone}
        >
          <span>{showCloneCoupler ? 'Show' : 'Hide'} Clone Coupler</span>
          {showCloneCoupler && <span className="toggle-icon">&#10003;</span>}
        </div>

        {/* Duplicate Toggle */}
        <div 
          className={`toggle-pill ${hideDuplicates ? 'active' : ''}`}
          onClick={onToggleDupes}
        >
          <span>Hide Duplicates</span>
          {hideDuplicates && <span className="toggle-icon">&#10003;</span>}
        </div>
        
        {/* Pinna Filter (Headphones Only) */}
        {pinnaFilter && (
          <div className="pinna-selector">
            <select 
              value={pinnaFilter} 
              onChange={(e) => onPinnaChange?.(e.target.value)}
              className="pinna-dropdown"
            >
              <option value="all">All Pinnae</option>
              <option value="kb5">KB5</option>
              <option value="kb0065">KB0065</option>
              <option value="5128">5128</option>
            </select>
          </div>
        )}
      </div>

      <ul>
        {displayedItems.map((iem: ScoredIEM, index: number) => (
          <li key={`${iem.id}-${index}`} className={`quality-${iem.quality}`}>
            <span className="rank">{index + 1}.</span>
            <span className="iem-name">{iem.name}</span>
            {iem.rig && (
              <span className={`rig-badge rig-${iem.rig}`}>
                {iem.rig}
              </span>
            )}
            <span className={`score ${getScoreClass(iem.similarity)}`}>
              {iem.similarity.toFixed(1)}
            </span>
            
            {/* Desktop-only Metrics */}
            <div className="metrics">
              <span title="Standard Deviation (Lower is better)">SD: {iem.stdev?.toFixed(2)}</span>
              <span title="Slope (Lower is better)">SL: {Math.abs(iem.slope || 0).toFixed(2)}</span>
              <span title="Average Error (Lower is better)">AE: {iem.avgError?.toFixed(2)}</span>
            </div>

            <span className={`quality-indicator ${iem.quality}`}>
              {iem.quality === 'high' ? '\u2605' : '\u2606'}
            </span>
            <a
              href={getSquigUrl(iem)}
              target="_blank"
              rel="noopener noreferrer"
              className="view-graph-btn"
              title={`View on ${iem.sourceDomain}`}
            >
              View Graph
            </a>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button className="load-more-btn" onClick={onLoadMore}>
          Load More ({showCount} of {totalAvailable})
        </button>
      )}
    </div>
  );
}

function getScoreClass(score: number): string {
  // RMS-based scoring: higher = closer to target
  // 70+ = excellent (very close match)
  // 60+ = good
  // 50+ = fair
  // below = poor
  if (score >= 70) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 50) return 'orange';
  if (score >= 0) return 'red';
  return 'gray';
}

export { SimilarityList };
