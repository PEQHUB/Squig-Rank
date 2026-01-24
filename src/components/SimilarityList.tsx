import { useState } from 'react';
import type { CalculationResult } from '../types';

export default function SimilarityList({ results }: { results: CalculationResult[] }) {
  const [activeColumn, setActiveColumn] = useState(0);
  const [qualityFilters, setQualityFilters] = useState(
    results.map(() => true)
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

  const filteredResults = results.map((result, index) => {
    if (!qualityFilters[index]) {
      return {
        ...result,
        top25: result.top25.filter(iem => iem.quality === 'high')
      };
    }
    return result;
  });

  return (
    <div className="similarity-list">
      {isMobile ? (
        <div className="mobile-view">
          <button onClick={handlePrev} className="nav-button">&#9664;</button>
          <TargetColumn
            data={filteredResults[activeColumn]}
            includeLowQuality={qualityFilters[activeColumn]}
            onQualityToggle={() => handleQualityToggle(activeColumn)}
          />
          <button onClick={handleNext} className="nav-button">&#9654;</button>
        </div>
      ) : (
        <div className="desktop-view">
          {filteredResults.map((result, index) => (
            <TargetColumn
              key={result.targetName}
              data={result}
              includeLowQuality={qualityFilters[index]}
              onQualityToggle={() => handleQualityToggle(index)}
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

function TargetColumn({ data, includeLowQuality, onQualityToggle }: any) {
  return (
    <div className="target-column">
      <h2>{data.targetName}</h2>
      <label className="quality-filter">
        <input
          type="checkbox"
          checked={includeLowQuality}
          onChange={onQualityToggle}
        />
        Show <span className="star-low">&#9734;</span> Low Quality
      </label>
      <ul>
        {data.top25.map((iem: any, index: number) => (
          <li key={iem.id} className={`quality-${iem.quality}`}>
            <span className="rank">{index + 1}.</span>
            <span className="iem-name">{iem.name}</span>
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
    </div>
  );
}

function getScoreClass(score: number): string {
  if (score >= 90) return 'green';
  if (score >= 80) return 'yellow';
  if (score >= 70) return 'orange';
  if (score >= 0) return 'red';
  return 'gray';
}

export { SimilarityList };
