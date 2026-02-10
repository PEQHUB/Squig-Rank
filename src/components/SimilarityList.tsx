import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { CalculationResult, ScoredIEM, LatestDevice, CategoryFilter, MeasurementMode, BuilderResults } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';

const PAGE_SIZE = 25;

interface SimilarityListProps {
  results: CalculationResult[];
  categoryFilter?: CategoryFilter;
  measurementMode?: MeasurementMode;
  latestIemDevices?: LatestDevice[];
  latestKb5Devices?: LatestDevice[];
  latest5128Devices?: LatestDevice[];
  latestIem5128Devices?: LatestDevice[];
  builderResults?: BuilderResults;
  onFindSimilar?: (iem: ScoredIEM) => void;
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
  categoryFilter = 'iem',
  measurementMode = 'ie',
  latestIemDevices,
  latestKb5Devices,
  latest5128Devices,
  latestIem5128Devices,
  builderResults,
  onFindSimilar
}: SimilarityListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Check if any displayable data exists for the current mode
  const hasBuilderData = measurementMode === 'ie'
    ? !!builderResults?.iem || !!builderResults?.iem_5128
    : !!builderResults?.hp_kb5 || !!builderResults?.hp_5128;
  const hasCustomData = results && results.length > 0;
  const hasLatestData = measurementMode === 'ie'
    ? (latestIemDevices && latestIemDevices.length > 0) ||
      (latestIem5128Devices && latestIem5128Devices.length > 0)
    : (latestKb5Devices && latestKb5Devices.length > 0) ||
      (latest5128Devices && latest5128Devices.length > 0);
  const hasAnyData = hasBuilderData || hasCustomData || hasLatestData;

  if (!hasAnyData) {
    return <div className="loading-results">Loading latest devices...</div>;
  }

  return <LatestTabView
    iemDevices={latestIemDevices || []}
    kb5Devices={latestKb5Devices || []}
    hp5128Devices={latest5128Devices || []}
    iem5128Devices={latestIem5128Devices || []}
    categoryFilter={categoryFilter}
    measurementMode={measurementMode}
    searchTerm={searchTerm}
    onSearchChange={setSearchTerm}
    builderResults={builderResults}
    customResults={results}
    onFindSimilar={onFindSimilar}
  />;
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
  onFindSimilar?: (iem: ScoredIEM) => void;
}

function TargetColumn({
  data,
  showCloneCoupler,
  hideDuplicates,
  searchTerm,
  onToggleClone,
  onToggleDupes,
  showCount,
  onLoadMore,
  onFindSimilar
}: TargetColumnProps) {
  const isMobile = useIsMobile();

  // Memoize filtering + deduplication (can process 18k+ items)
  const filteredItems = useMemo(() => {
    const allItems = data.ranked || [];

    // 1. Filter by Quality (Clone Coupler)
    let items = showCloneCoupler
      ? allItems
      : allItems.filter(iem => iem.quality === 'high');

    // 1.2 Filter by Search Term
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      items = items.filter(item =>
        item.name.toLowerCase().includes(term)
      );
    }

    // 2. Filter Duplicates (if enabled)
    if (hideDuplicates) {
      const seen = new Map<string, ScoredIEM>();

      for (const item of items) {
        const normalizedName = item.name.toLowerCase().trim();
        const rigKey = item.rig || '711';
        const key = `${normalizedName}::${rigKey}`;

        const existing = seen.get(key);

        if (!existing) {
          seen.set(key, item);
        } else {
          const scoreDiff = item.similarity - existing.similarity;

          if (scoreDiff > 0.0001) {
              seen.set(key, item);
          } else if (Math.abs(scoreDiff) < 0.0001) {
              if (item.quality === 'high' && existing.quality !== 'high') {
                  seen.set(key, item);
              }
          }
        }
      }

      items = Array.from(seen.values()).sort((a, b) => b.similarity - a.similarity);
    }

    return items;
  }, [data.ranked, showCloneCoupler, hideDuplicates, searchTerm]);

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
            key={iem.id}
            iem={iem}
            index={index}
            isMobile={isMobile}
            animIndex={index}
            onFindSimilar={onFindSimilar}
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

function SimilarityRow({ iem, index, isMobile, animIndex, onFindSimilar }: { iem: ScoredIEM, index: number, isMobile: boolean, animIndex?: number, onFindSimilar?: (iem: ScoredIEM) => void }) {
  return (
    <li
      className={`quality-${iem.quality} ${isMobile ? 'mobile-stack' : ''}`}
      style={animIndex !== undefined && animIndex < 15 ? { '--i': animIndex } as React.CSSProperties : undefined}
    >
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
        {onFindSimilar && (
          <button
            className="find-similar-btn"
            onClick={() => onFindSimilar(iem)}
            title="Find IEMs similar to this one"
          >
            Find Similar
          </button>
        )}
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
  iem5128Devices: LatestDevice[];
  categoryFilter: CategoryFilter;
  measurementMode: MeasurementMode;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  builderResults?: BuilderResults;
  customResults?: CalculationResult[];
  onFindSimilar?: (iem: ScoredIEM) => void;
}

function LatestTabView({ iemDevices, kb5Devices, hp5128Devices, iem5128Devices, categoryFilter, measurementMode, searchTerm, onSearchChange, builderResults, customResults, onFindSimilar }: LatestTabViewProps) {
  const isMobile = useIsMobile();
  const [localSearch, setLocalSearch] = useState(searchTerm);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input — update parent after 250ms of no typing
  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), 250);
  }, [onSearchChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Get devices for current category filter (for mobile view)
  const getMobileDevices = (): LatestDevice[] => {
    switch (categoryFilter) {
      case 'iem': return iemDevices;
      case 'hp_kb5': return kb5Devices;
      case 'hp_5128': return hp5128Devices;
      case 'iem_5128': return iem5128Devices;
    }
  };

  // Check if current mobile category has builder results
  const mobileBuilderResult = builderResults?.[categoryFilter] ?? null;
  // Check for custom upload results
  const mobileCustomResult = (customResults && customResults.length > 0) ? customResults[0] : null;

  return (
    <div className="similarity-list latest-tab">
      <div className="search-container">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search by model name..."
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {isMobile ? (
        mobileBuilderResult ? (
          <LatestMobileBuilderView result={mobileBuilderResult} searchTerm={searchTerm} onFindSimilar={onFindSimilar} />
        ) : mobileCustomResult ? (
          <LatestMobileBuilderView result={mobileCustomResult} searchTerm={searchTerm} onFindSimilar={onFindSimilar} />
        ) : (
          <LatestMobileView
            devices={getMobileDevices()}
            searchTerm={searchTerm}
            onFindSimilar={onFindSimilar}
          />
        )
      ) : (
        <LatestTwoColumns
          measurementMode={measurementMode}
          iemDevices={iemDevices}
          kb5Devices={kb5Devices}
          hp5128Devices={hp5128Devices}
          iem5128Devices={iem5128Devices}
          searchTerm={searchTerm}
          builderResults={builderResults}
          customResults={customResults}
          onFindSimilar={onFindSimilar}
        />
      )}
    </div>
  );
}

interface LatestMobileViewProps {
  devices: LatestDevice[];
  searchTerm: string;
  onFindSimilar?: (iem: ScoredIEM) => void;
}

function LatestMobileView({ devices, searchTerm, onFindSimilar }: LatestMobileViewProps) {
  const [displayCount, setDisplayCount] = useState(50);
  const [showCloneCoupler, setShowCloneCoupler] = useState(true);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Memoize expensive sort/rank computation
  const rankedDevices = useMemo(() => prepareLatestDevices(devices), [devices]);

  // Filter by search term, quality, and duplicates
  const preparedDevices = useMemo(() => {
    let filtered = rankedDevices;

    // Search filter
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(d => d.name.toLowerCase().includes(term));
    }

    // Quality filter (Clone Coupler)
    if (!showCloneCoupler) {
      filtered = filtered.filter(d => d.quality === 'high');
    }

    // Duplicate filter
    if (hideDuplicates) {
      const seen = new Map<string, LatestDeviceWithRank>();
      for (const device of filtered) {
        const normalizedName = device.name.toLowerCase().trim();
        const rigKey = device.rig || '711';
        const key = `${normalizedName}::${rigKey}`;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, device);
        } else {
          const scoreDiff = device.similarity - existing.similarity;
          if (scoreDiff > 0.0001) {
            seen.set(key, device);
          } else if (Math.abs(scoreDiff) < 0.0001 && device.quality === 'high' && existing.quality !== 'high') {
            seen.set(key, device);
          }
        }
      }
      filtered = Array.from(seen.values());
    }

    return filtered;
  }, [rankedDevices, searchTerm, showCloneCoupler, hideDuplicates]);

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
  if (preparedDevices.length === 0 && !searchTerm?.trim() && showCloneCoupler && !hideDuplicates) {
    return <LatestEmptyState category="devices" />;
  }

  return (
    <div
      className="latest-single-column"
      ref={scrollRef}
      onScroll={handleScroll}
    >
      <div className="filter-controls">
        <div
          className={`toggle-pill clone-toggle ${showCloneCoupler ? 'active' : ''}`}
          onClick={() => setShowCloneCoupler(prev => !prev)}
        >
          <span>{showCloneCoupler ? 'Show' : 'Hide'} Clone Coupler</span>
          {showCloneCoupler && <span className="toggle-icon">&#10003;</span>}
        </div>
        <div
          className={`toggle-pill ${hideDuplicates ? 'active' : ''}`}
          onClick={() => setHideDuplicates(prev => !prev)}
        >
          <span>Hide Duplicates</span>
          {hideDuplicates && <span className="toggle-icon">&#10003;</span>}
        </div>
      </div>

      <ul>
        {displayedDevices.map((device, index) => (
          <LatestDeviceRow
            key={device.id}
            device={device}
            animIndex={index}
            onFindSimilar={onFindSimilar}
          />
        ))}
      </ul>
      {displayCount < preparedDevices.length && (
        <div className="loading-more">Scroll for more...</div>
      )}
    </div>
  );
}

// Mobile view for builder results on Latest tab
function LatestMobileBuilderView({ result, searchTerm, onFindSimilar }: { result: CalculationResult; searchTerm: string; onFindSimilar?: (iem: ScoredIEM) => void }) {
  const [showCloneCoupler, setShowCloneCoupler] = useState(true);
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [showCount, setShowCount] = useState(PAGE_SIZE);

  return (
    <TargetColumn
      data={result}
      showCloneCoupler={showCloneCoupler}
      hideDuplicates={hideDuplicates}
      searchTerm={searchTerm}
      onToggleClone={() => setShowCloneCoupler(prev => !prev)}
      onToggleDupes={() => setHideDuplicates(prev => !prev)}
      showCount={showCount}
      onLoadMore={() => setShowCount(prev => prev + PAGE_SIZE)}
      onFindSimilar={onFindSimilar}
    />
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

interface LatestTwoColumnsProps {
  measurementMode: MeasurementMode;
  iemDevices: LatestDevice[];
  kb5Devices: LatestDevice[];
  hp5128Devices: LatestDevice[];
  iem5128Devices: LatestDevice[];
  searchTerm: string;
  builderResults?: BuilderResults;
  customResults?: CalculationResult[];
  onFindSimilar?: (iem: ScoredIEM) => void;
}

function LatestTwoColumns({ measurementMode, iemDevices, kb5Devices, hp5128Devices, iem5128Devices, searchTerm, builderResults, customResults, onFindSimilar }: LatestTwoColumnsProps) {
  const [currentPage, setCurrentPage] = useState<Record<string, number>>({
    iem: 1, hp_kb5: 1, hp_5128: 1, iem_5128: 1
  });

  // Builder-ranked column state (separate from chronological pagination)
  const [builderShowClone, setBuilderShowClone] = useState<Record<string, boolean>>({
    iem: true, hp_kb5: true, hp_5128: true, iem_5128: true
  });
  const [builderHideDupes, setBuilderHideDupes] = useState<Record<string, boolean>>({
    iem: true, hp_kb5: true, hp_5128: true, iem_5128: true
  });
  const [builderShowCounts, setBuilderShowCounts] = useState<Record<string, number>>({
    iem: PAGE_SIZE, hp_kb5: PAGE_SIZE, hp_5128: PAGE_SIZE, iem_5128: PAGE_SIZE
  });

  // Latest column filter state
  const [latestShowClone, setLatestShowClone] = useState<Record<string, boolean>>({
    iem: true, hp_kb5: true, hp_5128: true, iem_5128: true
  });
  const [latestHideDupes, setLatestHideDupes] = useState<Record<string, boolean>>({
    iem: false, hp_kb5: false, hp_5128: false, iem_5128: false
  });

  // Memoize expensive sort/rank computation per device array
  const memoizedPrepare = useCallback((devices: LatestDevice[]) => prepareLatestDevices(devices), []);

  const prepareAndFilter = useCallback((devices: LatestDevice[]): LatestDeviceWithRank[] => {
    let prepared = memoizedPrepare(devices);

    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      prepared = prepared.filter(d => d.name.toLowerCase().includes(term));
    }

    return prepared;
  }, [memoizedPrepare, searchTerm]);

  const renderLatestColumn = (
    devices: LatestDeviceWithRank[],
    category: string,
    label: string
  ) => {
    const showClone = latestShowClone[category] ?? true;
    const hideDupes = latestHideDupes[category] ?? true;

    // Apply quality filter (Clone Coupler)
    let filteredDevices = showClone
      ? devices
      : devices.filter(d => d.quality === 'high');

    // Apply duplicate filter
    if (hideDupes) {
      const seen = new Map<string, LatestDeviceWithRank>();
      for (const device of filteredDevices) {
        const normalizedName = device.name.toLowerCase().trim();
        const rigKey = device.rig || '711';
        const key = `${normalizedName}::${rigKey}`;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, device);
        } else {
          // Keep the one with higher score, or prefer high quality as tiebreaker
          const scoreDiff = device.similarity - existing.similarity;
          if (scoreDiff > 0.0001) {
            seen.set(key, device);
          } else if (Math.abs(scoreDiff) < 0.0001 && device.quality === 'high' && existing.quality !== 'high') {
            seen.set(key, device);
          }
        }
      }
      filteredDevices = Array.from(seen.values());
    }

    const page = currentPage[category] || 1;
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageDevices = filteredDevices.slice(startIndex, endIndex);
    const totalPages = Math.ceil(filteredDevices.length / PAGE_SIZE);
    const totalDevices = filteredDevices.length;

    return (
      <div className="latest-column active">
        <h3>{label} ({totalDevices})</h3>

        <div className="filter-controls">
          <div
            className={`toggle-pill clone-toggle ${showClone ? 'active' : ''}`}
            onClick={() => setLatestShowClone(prev => ({ ...prev, [category]: !(prev[category] ?? true) }))}
          >
            <span>{showClone ? 'Show' : 'Hide'} Clone Coupler</span>
            {showClone && <span className="toggle-icon">&#10003;</span>}
          </div>
          <div
            className={`toggle-pill ${hideDupes ? 'active' : ''}`}
            onClick={() => setLatestHideDupes(prev => ({ ...prev, [category]: !(prev[category] ?? true) }))}
          >
            <span>Hide Duplicates</span>
            {hideDupes && <span className="toggle-icon">&#10003;</span>}
          </div>
        </div>

        {totalDevices > 0 ? (
          <>
            <ul>
              {pageDevices.map((device, index) => (
                <LatestDeviceRow
                  key={device.id}
                  device={device}
                  animIndex={index}
                  onFindSimilar={onFindSimilar}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  onClick={() => setCurrentPage(prev => ({ ...prev, [category]: Math.max(1, (prev[category] || 1) - 1) }))}
                  disabled={page === 1}
                >
                  Prev
                </button>
                <span>{page} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(prev => ({ ...prev, [category]: Math.min(totalPages, (prev[category] || 1) + 1) }))}
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

  const renderBuilderColumn = (
    result: CalculationResult,
    category: string
  ) => {
    return (
      <TargetColumn
        data={result}
        showCloneCoupler={builderShowClone[category] ?? true}
        hideDuplicates={builderHideDupes[category] ?? true}
        searchTerm={searchTerm}
        onToggleClone={() => setBuilderShowClone(prev => ({ ...prev, [category]: !(prev[category] ?? true) }))}
        onToggleDupes={() => setBuilderHideDupes(prev => ({ ...prev, [category]: !(prev[category] ?? true) }))}
        showCount={builderShowCounts[category] ?? PAGE_SIZE}
        onLoadMore={() => setBuilderShowCounts(prev => ({ ...prev, [category]: (prev[category] ?? PAGE_SIZE) + PAGE_SIZE }))}
        onFindSimilar={onFindSimilar}
      />
    );
  };

  // Determine which 2 columns to show based on measurement mode
  if (measurementMode === 'ie') {
    const preparedIem = prepareAndFilter(iemDevices);
    const preparedIem5128 = prepareAndFilter(iem5128Devices);
    const iemBuilderResult = builderResults?.iem;
    const iem5128BuilderResult = builderResults?.iem_5128;

    // Custom upload results override both columns if present
    const hasCustom = customResults && customResults.length > 0;

    const col1Ranked = hasCustom || !!iemBuilderResult;
    const col2Ranked = !!iem5128BuilderResult;
    const onlyOneRanked = (col1Ranked || col2Ranked) && !(col1Ranked && col2Ranked);

    const col1 = hasCustom
      ? renderBuilderColumn(customResults![0], 'iem')
      : iemBuilderResult
        ? renderBuilderColumn(iemBuilderResult, 'iem')
        : renderLatestColumn(preparedIem, 'iem', 'IEMs (711)');

    const col2 = iem5128BuilderResult
      ? renderBuilderColumn(iem5128BuilderResult, 'iem_5128')
      : renderLatestColumn(preparedIem5128, 'iem_5128', '5128 IE');

    return (
      <div className={`latest-two-columns${onlyOneRanked ? ' single-ranked' : ''}`}>
        {onlyOneRanked ? (col1Ranked ? col1 : col2) : <>{col1}{col2}</>}
      </div>
    );
  } else {
    const preparedKb5 = prepareAndFilter(kb5Devices);
    const prepared5128 = prepareAndFilter(hp5128Devices);
    const kb5BuilderResult = builderResults?.hp_kb5;
    const hp5128BuilderResult = builderResults?.hp_5128;
    const hasCustom = customResults && customResults.length > 0;

    const col1Ranked = hasCustom || !!kb5BuilderResult;
    const col2Ranked = !!hp5128BuilderResult;
    const onlyOneRanked = (col1Ranked || col2Ranked) && !(col1Ranked && col2Ranked);

    const col1 = hasCustom
      ? renderBuilderColumn(customResults![0], 'hp_kb5')
      : kb5BuilderResult
        ? renderBuilderColumn(kb5BuilderResult, 'hp_kb5')
        : renderLatestColumn(preparedKb5, 'hp_kb5', 'KB5 (711) OE');

    const col2 = hp5128BuilderResult
      ? renderBuilderColumn(hp5128BuilderResult, 'hp_5128')
      : renderLatestColumn(prepared5128, 'hp_5128', 'B&K 5128 OE');

    return (
      <div className={`latest-two-columns${onlyOneRanked ? ' single-ranked' : ''}`}>
        {onlyOneRanked ? (col1Ranked ? col1 : col2) : <>{col1}{col2}</>}
      </div>
    );
  }
}

interface LatestDeviceRowProps {
  device: LatestDeviceWithRank;
  animIndex?: number;
  onFindSimilar?: (iem: ScoredIEM) => void;
}

function LatestDeviceRow({ device, animIndex, onFindSimilar }: LatestDeviceRowProps) {
  const isMobile = useIsMobile();

  return (
    <li
      className={`quality-${device.quality} ${isMobile ? 'mobile-stack' : ''}`}
      style={animIndex !== undefined && animIndex < 15 ? { '--i': animIndex } as React.CSSProperties : undefined}
    >
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
        {onFindSimilar && (
          <button
            className="find-similar-btn"
            onClick={() => onFindSimilar(device)}
            title="Find IEMs similar to this one"
          >
            Find Similar
          </button>
        )}
      </div>
    </li>
  );
}

export { SimilarityList };
