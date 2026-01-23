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
          <button onClick={handlePrev} className="nav-button">◀</button>
          <TargetColumn
            data={filteredResults[activeColumn]}
            includeLowQuality={qualityFilters[activeColumn]}
            onQualityToggle={() => handleQualityToggle(activeColumn)}
          />
          <button onClick={handleNext} className="nav-button">▶</button>
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
        Include Low Quality
      </label>
      <ul>
        {data.top25.map((iem: any, index: number) => (
          <li key={iem.id} className={`quality-${iem.quality}`}>
            <span className="rank">{index + 1}.</span>
            <span className="iem-name">{iem.name}</span>
            <span className={`score ${getScoreClass(iem.similarity)}`}>
              {iem.similarity.toFixed(1)}
            </span>
            {iem.quality === 'high' && <span className="quality-indicator">★</span>}
            {iem.quality === 'low' && <span className="quality-indicator">☆</span>}
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
