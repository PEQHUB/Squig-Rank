import { useState, useEffect, useRef, useCallback } from 'react';
import type { CalculationResult, ScoredIEM, LatestDevice, CategoryFilter } from '../types';

const PAGE_SIZE = 25;

interface SimilarityListProps {
  results: CalculationResult[];
  latestDevices?: LatestDevice[];
  isLatestTab?: boolean;
  categoryFilter?: CategoryFilter;
}

export default function SimilarityList({ 
  results, 
  latestDevices, 
  isLatestTab = false, 
  categoryFilter = 'iem' 
}: SimilarityListProps) {
  const [activeColumn, setActiveColumn] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for filters
  const [showCloneCoupler, setShowCloneCoupler] = useState<boolean[]>([]);
  const [hideDuplicates, setHideDuplicates] = useState<boolean[]>([]);
  const [showCounts, setShowCounts] = useState<number[]>([]);

  // Update filters when results change
  useEffect(() => {
    if (results.length > 0) {
      setShowCloneCoupler(results.map(() => true));
      setHideDuplicates(results.map(() => true));
      setShowCounts(results.map(() => PAGE_SIZE));
    }
  }, [results]);

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

  const handleLoadMore = (targetIndex: number) => {
    setShowCounts(prev => {
      const newCounts = [...prev];
      newCounts[targetIndex] += PAGE_SIZE;
      return newCounts;
    });
  };

  // Render Latest tab
  if (isLatestTab) {
    if (!latestDevices || latestDevices.length === 0) {
      return <div className="loading-results">Loading latest devices...</div>;
    }
    
    return <LatestTabView 
      devices={latestDevices} 
      categoryFilter={categoryFilter} 
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
    />;
  }

  // Render normal tabs
  if (!results || results.length === 0) {
    return <div className="loading-results">Loading rankings...</div>;
  }

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
            searchTerm={searchTerm}
            onToggleClone={() => toggleCloneCoupler(activeColumn)}
            onToggleDupes={() => toggleDuplicates(activeColumn)}
            showCount={showCounts[activeColumn]}
            onLoadMore={() => handleLoadMore(activeColumn)}
          />
          <button onClick={handleNext} className="nav-button">&#9654;</button>
        </div>
      ) : (
        <div className={`desktop-view ${results.length === 1 ? 'single-column' : ''}`}>
          {results.map((result, index) => (
            <TargetColumn
              key={result.targetName}
              data={result}
              showCloneCoupler={showCloneCoupler[index]}
              hideDuplicates={hideDuplicates[index]}
              searchTerm={searchTerm}
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
    const isHeadphone = iem.type === 'headphone';
    const is5128 = iem.rig === '5128';
    let path = 'iem/711';
    
    if (isHeadphone) {
        path = 'headphones';
    } else if (is5128) {
        path = 'iem/5128';
    }
    
    return `https://graph.hangout.audio/${path}/?share=${encodeURIComponent(fileName)}`;
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
  if (subdomain === 'earphonesarchiveHP') {
    return `https://earphonesarchive.squig.link/headphones/?share=${encodeURIComponent(fileName)}`;
  }
  
  return `https://${subdomain}.squig.link/?share=${encodeURIComponent(fileName)}`;
}

interface TargetColumnProps {
  data: CalculationResult;
  showCloneCoupler: boolean;
  hideDuplicates: boolean;
  searchTerm?: string;
  onToggleClone: () => void;
  onToggleDupes: () => void;
  showCount: number;
  onLoadMore: () => void;
}

function TargetColumn({ 
  data, 
  showCloneCoupler, 
  hideDuplicates,
  searchTerm,
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

  // Pinna filter removed - headphones are now pre-separated by rig type in separate files

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
        {data.targetFiles && data.targetFiles['kb5'] && (
          <a href={`targets/${data.targetFiles['kb5']}`} download className="target-download-btn" title="Download KB5 (711) Target">
            Target
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
        
        {/* Pinna Filter removed - headphones are now pre-separated by rig type */}
      </div>

      <ul>
        {displayedItems.map((iem: ScoredIEM, index: number) => (
          <SimilarityRow 
            key={`${iem.id}-${index}`}
            iem={iem}
            index={index}
            isMobile={window.innerWidth <= 768}
          />
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

function SimilarityRow({ iem, index, isMobile }: { iem: ScoredIEM, index: number, isMobile: boolean }) {
  return (
    <li className={`quality-${iem.quality} ${isMobile ? 'mobile-stack' : ''}`}>
      <div className="row-main">
        <span className="rank">{index + 1}.</span>
        <span className="iem-name">{iem.name}</span>
        <span className={`score ${getScoreClass(iem.similarity)}`}>
          {iem.similarity.toFixed(1)}
        </span>
      </div>
      
      <div className="row-details">
        {iem.rig && (
          <span className={`rig-badge rig-${iem.rig}`}>
            {iem.rig}
          </span>
        )}
        <span className={`tag ${iem.quality === 'high' ? 'genuine' : 'clone'}`}>
          {iem.quality === 'high' ? 'Genuine' : 'Clone'}
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
      </div>
    </li>
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

// =============================================================================
// LATEST TAB COMPONENTS
// =============================================================================

interface LatestTabViewProps {
  devices: LatestDevice[];
  categoryFilter: CategoryFilter;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

function LatestTabView({ devices, categoryFilter, searchTerm, onSearchChange }: LatestTabViewProps) {
  const isMobile = window.innerWidth <= 768;
  
  return (
    <div className="similarity-list latest-tab">
      <div className="search-container">
        <span className="search-icon">🔍</span>
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search by model name..." 
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      
      {isMobile ? (
        <LatestMobileView
          devices={devices}
          categoryFilter={categoryFilter}
          searchTerm={searchTerm}
        />
      ) : (
        <LatestThreeColumns
          devices={devices}
          categoryFilter={categoryFilter}
          searchTerm={searchTerm}
        />
      )}
    </div>
  );
}

interface LatestMobileViewProps {
  devices: LatestDevice[];
  categoryFilter: CategoryFilter;
  searchTerm: string;
}

function LatestMobileView({ devices, categoryFilter, searchTerm }: LatestMobileViewProps) {
  const [displayCount, setDisplayCount] = useState(50);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Filter devices by category
  let filteredDevices = devices.filter(d => d.category === categoryFilter);
  
  // Filter by search term
  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.toLowerCase().trim();
    filteredDevices = filteredDevices.filter(d => d.name.toLowerCase().includes(term));
  }
  
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    
    const element = scrollRef.current;
    const scrolledToBottom = element.scrollHeight - element.scrollTop <= element.clientHeight * 1.5;
    
    if (scrolledToBottom && displayCount < filteredDevices.length) {
      setDisplayCount(prev => Math.min(prev + 25, filteredDevices.length));
    }
  }, [displayCount, filteredDevices.length]);
  
  const displayedDevices = filteredDevices.slice(0, displayCount);
  
  return (
    <div 
      className="latest-single-column" 
      ref={scrollRef}
      onScroll={handleScroll}
    >
      <ul>
        {displayedDevices.map((device, index) => (
          <LatestDeviceRow 
            key={`${device.id}-${index}`}
            device={device}
            rank={index + 1}
          />
        ))}
      </ul>
      {displayCount < filteredDevices.length && (
        <div className="loading-more">Scroll for more...</div>
      )}
    </div>
  );
}

interface LatestThreeColumnsProps {
  devices: LatestDevice[];
  categoryFilter: CategoryFilter;
  searchTerm: string;
}

function LatestThreeColumns({ devices, categoryFilter, searchTerm }: LatestThreeColumnsProps) {
  const [currentPage, setCurrentPage] = useState<{iem: number, hp_kb5: number, hp_5128: number}>({
    iem: 1,
    hp_kb5: 1,
    hp_5128: 1
  });
  
  const filterByCategory = (category: 'iem' | 'hp_kb5' | 'hp_5128') => {
    let filtered = devices.filter(d => d.category === category);
    
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(d => d.name.toLowerCase().includes(term));
    }
    
    return filtered;
  };
  
  const iemDevices = filterByCategory('iem');
  const kb5Devices = filterByCategory('hp_kb5');
  const hp5128Devices = filterByCategory('hp_5128');
  
  const renderColumn = (
    devices: LatestDevice[], 
    category: 'iem' | 'hp_kb5' | 'hp_5128',
    label: string,
    isActive: boolean
  ) => {
    const page = currentPage[category];
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageDevices = devices.slice(startIndex, endIndex);
    const totalPages = Math.ceil(devices.length / PAGE_SIZE);
    
    return (
      <div className={`latest-column ${isActive ? 'active' : 'empty'}`}>
        <h3>{label}</h3>
        {isActive ? (
          <>
            <ul>
              {pageDevices.map((device, index) => (
                <LatestDeviceRow
                  key={`${device.id}-${index}`}
                  device={device}
                  rank={startIndex + index + 1}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button 
                  onClick={() => setCurrentPage(prev => ({ ...prev, [category]: Math.max(1, prev[category] - 1) }))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button 
                  onClick={() => setCurrentPage(prev => ({ ...prev, [category]: Math.min(totalPages, prev[category] + 1) }))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state"></div>
        )}
      </div>
    );
  };
  
  return (
    <div className="latest-three-columns">
      {renderColumn(iemDevices, 'iem', 'IEMs', categoryFilter === 'iem')}
      {renderColumn(kb5Devices, 'hp_kb5', 'KEMAR (711) OE', categoryFilter === 'hp_kb5')}
      {renderColumn(hp5128Devices, 'hp_5128', 'B&K 5128 OE', categoryFilter === 'hp_5128')}
    </div>
  );
}

interface LatestDeviceRowProps {
  device: LatestDevice;
  rank: number;
}

function LatestDeviceRow({ device, rank }: LatestDeviceRowProps) {
  const isMobile = window.innerWidth <= 768;
  
  return (
    <li className={`quality-${device.quality} ${isMobile ? 'mobile-stack' : ''}`}>
      <div className="row-main">
        <span className="rank">{rank}.</span>
        <span className="iem-name">{device.name}</span>
        <span className={`score ${getScoreClass(device.similarity)}`}>
          {device.similarity.toFixed(1)}
        </span>
      </div>
      
      <div className="row-details">
        {device.rig && (
          <span className={`rig-badge rig-${device.rig}`}>
            {device.rig}
          </span>
        )}
        <span className={`tag ${device.quality === 'high' ? 'genuine' : 'clone'}`}>
          {device.quality === 'high' ? 'Genuine' : 'Clone'}
        </span>
        <a
          href={getSquigUrl(device)}
          target="_blank"
          rel="noopener noreferrer"
          className="view-graph-btn"
          title={`View on ${device.sourceDomain}`}
        >
          View Graph
        </a>
      </div>
    </li>
  );
}

export { SimilarityList };
