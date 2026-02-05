import { useState, useEffect, useRef, useCallback } from 'react';
import type { CalculationResult, ScoredIEM, LatestDevice, CategoryFilter } from '../types';

const PAGE_SIZE = 25;

interface SimilarityListProps {
  results: CalculationResult[];
  isLatestTab?: boolean;
  categoryFilter?: CategoryFilter;
  latestIemDevices?: LatestDevice[];
  latestKb5Devices?: LatestDevice[];
  latest5128Devices?: LatestDevice[];
}

// Extended type with PPI rank for Latest tab
interface LatestDeviceWithRank extends LatestDevice {
  ppiRank: number;
}

// Format relative time since a date (supports both ISO timestamps and date-only strings)
function formatTimeSince(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Less than 1 minute
  if (diffMinutes < 1) return 'Just now';
  
  // Less than 1 hour - show minutes
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  
  // Less than 24 hours - show hours
  if (diffHours < 24) return `${diffHours}h ago`;
  
  // 1 day ago
  if (diffDays === 1) return 'Yesterday';
  
  // Less than a week
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // Less than a month
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  
  // Less than a year
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  
  return `${Math.floor(diffDays / 365)}y ago`;
}

// Add PPI rank and sort chronologically (newest first)
function prepareLatestDevices(devices: LatestDevice[]): LatestDeviceWithRank[] {
  // Sort by PPI score (similarity) to establish true rankings
  const sortedByPPI = [...devices].sort((a, b) => b.similarity - a.similarity);
  
  // Create a map of device ID to its true PPI rank
  const rankMap = new Map<string, number>();
  sortedByPPI.forEach((device, index) => {
    rankMap.set(device.id, index + 1);
  });
  
  // Filter to only devices with firstSeen, and add their true PPI rank
  const withRank = devices
    .filter(d => d.firstSeen)
    .map(device => ({
      ...device,
      ppiRank: rankMap.get(device.id) || 0
    }));
  
  // Sort by firstSeen (newest first)
  return withRank.sort((a, b) => {
    const dateA = new Date(a.firstSeen!);
    const dateB = new Date(b.firstSeen!);
    return dateB.getTime() - dateA.getTime();
  });
}

export default function SimilarityList({ 
  results, 
  isLatestTab = false, 
  categoryFilter = 'iem',
  latestIemDevices,
  latestKb5Devices,
  latest5128Devices
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
    // Check if any data is available
    const hasAnyData = (latestIemDevices && latestIemDevices.length > 0) ||
                       (latestKb5Devices && latestKb5Devices.length > 0) ||
                       (latest5128Devices && latest5128Devices.length > 0);
    
    if (!hasAnyData) {
      return <div className="loading-results">Loading latest devices...</div>;
    }
    
    return <LatestTabView 
      iemDevices={latestIemDevices || []}
      kb5Devices={latestKb5Devices || []}
      hp5128Devices={latest5128Devices || []}
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
  if (subdomain === 'crinacle5128') {
    return `https://graph.hangout.audio/iem/5128/?share=${encodeURIComponent(fileName)}`;
  }
  if (subdomain === 'crinacleHP') {
    return `https://graph.hangout.audio/headphones/?share=${encodeURIComponent(fileName)}`;
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

  // Only show target downloads for IEM tab (has both 711 and 5128 targets)
  const showTargetDownloads = data.targetFiles && data.targetFiles['711'] && data.targetFiles['5128'];

  return (
    <div className="target-column">
      <h2>{data.targetName}</h2>
      
      {showTargetDownloads && (
        <div className="target-downloads">
          <a href={`targets/${data.targetFiles!['711']}`} download className="target-download-btn" title="Download 711 Target">
            711 Target
          </a>
          <a href={`targets/${data.targetFiles!['5128']}`} download className="target-download-btn" title="Download 5128 Target">
            5128 Target
          </a>
        </div>
      )}

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
  iemDevices: LatestDevice[];
  kb5Devices: LatestDevice[];
  hp5128Devices: LatestDevice[];
  categoryFilter: CategoryFilter;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

function LatestTabView({ iemDevices, kb5Devices, hp5128Devices, categoryFilter, searchTerm, onSearchChange }: LatestTabViewProps) {
  const isMobile = window.innerWidth <= 768;
  
  // Get devices for current category filter (for mobile view)
  const getMobileDevices = (): LatestDevice[] => {
    switch (categoryFilter) {
      case 'iem': return iemDevices;
      case 'hp_kb5': return kb5Devices;
      case 'hp_5128': return hp5128Devices;
    }
  };
  
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
          devices={getMobileDevices()}
          searchTerm={searchTerm}
        />
      ) : (
        <LatestThreeColumns
          iemDevices={iemDevices}
          kb5Devices={kb5Devices}
          hp5128Devices={hp5128Devices}
          searchTerm={searchTerm}
        />
      )}
    </div>
  );
}

interface LatestMobileViewProps {
  devices: LatestDevice[];
  searchTerm: string;
}

function LatestMobileView({ devices, searchTerm }: LatestMobileViewProps) {
  const [displayCount, setDisplayCount] = useState(50);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Prepare devices with rank and sort chronologically
  let preparedDevices = prepareLatestDevices(devices);
  
  // Filter by search term
  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.toLowerCase().trim();
    preparedDevices = preparedDevices.filter(d => d.name.toLowerCase().includes(term));
  }
  
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    
    const element = scrollRef.current;
    const scrolledToBottom = element.scrollHeight - element.scrollTop <= element.clientHeight * 1.5;
    
    if (scrolledToBottom && displayCount < preparedDevices.length) {
      setDisplayCount(prev => Math.min(prev + 25, preparedDevices.length));
    }
  }, [displayCount, preparedDevices.length]);
  
  const displayedDevices = preparedDevices.slice(0, displayCount);
  
  // Show empty state if no devices with firstSeen
  if (preparedDevices.length === 0) {
    return <LatestEmptyState category="devices" />;
  }
  
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
          />
        ))}
      </ul>
      {displayCount < preparedDevices.length && (
        <div className="loading-more">Scroll for more...</div>
      )}
    </div>
  );
}

// Empty state component
function LatestEmptyState({ category }: { category: string }) {
  return (
    <div className="latest-empty-state">
      <p>No new {category} added yet.</p>
      <p className="empty-hint">New devices will appear here as they are discovered.</p>
    </div>
  );
}

interface LatestThreeColumnsProps {
  iemDevices: LatestDevice[];
  kb5Devices: LatestDevice[];
  hp5128Devices: LatestDevice[];
  searchTerm: string;
}

function LatestThreeColumns({ iemDevices, kb5Devices, hp5128Devices, searchTerm }: LatestThreeColumnsProps) {
  const [currentPage, setCurrentPage] = useState<{iem: number, hp_kb5: number, hp_5128: number}>({
    iem: 1,
    hp_kb5: 1,
    hp_5128: 1
  });
  
  // Prepare devices with rank and sort chronologically, then filter by search
  const prepareAndFilter = (devices: LatestDevice[]): LatestDeviceWithRank[] => {
    let prepared = prepareLatestDevices(devices);
    
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      prepared = prepared.filter(d => d.name.toLowerCase().includes(term));
    }
    
    return prepared;
  };
  
  const preparedIem = prepareAndFilter(iemDevices);
  const preparedKb5 = prepareAndFilter(kb5Devices);
  const prepared5128 = prepareAndFilter(hp5128Devices);
  
  const renderColumn = (
    devices: LatestDeviceWithRank[], 
    category: 'iem' | 'hp_kb5' | 'hp_5128',
    label: string
  ) => {
    const page = currentPage[category];
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageDevices = devices.slice(startIndex, endIndex);
    const totalPages = Math.ceil(devices.length / PAGE_SIZE);
    const totalDevices = devices.length;
    
    return (
      <div className="latest-column active">
        <h3>{label} ({totalDevices})</h3>
        {totalDevices > 0 ? (
          <>
            <ul>
              {pageDevices.map((device, index) => (
                <LatestDeviceRow
                  key={`${device.id}-${index}`}
                  device={device}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button 
                  onClick={() => setCurrentPage(prev => ({ ...prev, [category]: Math.max(1, prev[category] - 1) }))}
                  disabled={page === 1}
                >
                  Prev
                </button>
                <span>{page} / {totalPages}</span>
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
          <LatestEmptyState category={label} />
        )}
      </div>
    );
  };
  
  return (
    <div className="latest-three-columns">
      {renderColumn(preparedIem, 'iem', 'IEMs')}
      {renderColumn(preparedKb5, 'hp_kb5', 'KEMAR (711) OE')}
      {renderColumn(prepared5128, 'hp_5128', 'B&K 5128 OE')}
    </div>
  );
}

interface LatestDeviceRowProps {
  device: LatestDeviceWithRank;
}

function LatestDeviceRow({ device }: LatestDeviceRowProps) {
  const isMobile = window.innerWidth <= 768;
  
  return (
    <li className={`quality-${device.quality} ${isMobile ? 'mobile-stack' : ''}`}>
      <div className="row-main">
        <span className="iem-name">{device.name}</span>
        <span className="rank-badge">Rank {device.ppiRank}</span>
        <span className={`score ${getScoreClass(device.similarity)}`}>
          {device.similarity.toFixed(1)}
        </span>
        {device.firstSeen && (
          <span className="first-seen">{formatTimeSince(device.firstSeen)}</span>
        )}
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
