import { useState } from 'react';
import type { CalculationResult } from '../types';

const PAGE_SIZE = 25;

export default function SimilarityList({ results }: { results: CalculationResult[] }) {
  const [activeColumn, setActiveColumn] = useState(0);
  const [qualityFilters, setQualityFilters] = useState(
    results.map(() => true)
  );
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

  const handleQualityToggle = (targetIndex: number) => {
    setQualityFilters(prev => {
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

  return (
    <div className="similarity-list">
      {isMobile ? (
        <div className="mobile-view">
          <button onClick={handlePrev} className="nav-button">&#9664;</button>
          <TargetColumn
            data={results[activeColumn]}
            includeLowQuality={qualityFilters[activeColumn]}
            onQualityToggle={() => handleQualityToggle(activeColumn)}
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
              includeLowQuality={qualityFilters[index]}
              onQualityToggle={() => handleQualityToggle(index)}
              showCount={showCounts[index]}
              onLoadMore={() => handleLoadMore(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getSquigUrl(iem: any): string {
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
  includeLowQuality: boolean;
  onQualityToggle: () => void;
  showCount: number;
  onLoadMore: () => void;
}

function TargetColumn({ data, includeLowQuality, onQualityToggle, showCount, onLoadMore }: TargetColumnProps) {
  // Filter based on quality preference
  const allItems = data.ranked || [];
  const filteredItems = includeLowQuality 
    ? allItems 
    : allItems.filter(iem => iem.quality === 'high');
  
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

      <label className="quality-filter">
        <input
          type="checkbox"
          checked={includeLowQuality}
          onChange={onQualityToggle}
        />
        Show <span className="star-low">&#9734;</span> Low Quality
      </label>
      <ul>
        {displayedItems.map((iem: any, index: number) => (
          <li key={iem.id} className={`quality-${iem.quality}`}>
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
