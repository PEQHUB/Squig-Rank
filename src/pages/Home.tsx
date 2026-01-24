import { useState, useEffect } from 'react';
import { SimilarityList } from '../components/SimilarityList';
import { TargetSubmission } from '../components/TargetSubmission';
import type { CalculationResult } from '../types';

interface ResultsData {
  generatedAt: string;
  totalIEMs: number;
  results: CalculationResult[];
}

export default function Home() {
  const [results, setResults] = useState<CalculationResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [totalIEMs, setTotalIEMs] = useState<number>(0);

  useEffect(() => {
    async function loadResults() {
      try {
        const response = await fetch('./data/results.json');
        if (!response.ok) {
          throw new Error('Results not available yet');
        }
        const data: ResultsData = await response.json();
        setResults(data.results);
        setLastUpdate(data.generatedAt);
        setTotalIEMs(data.totalIEMs);
      } catch (e: unknown) {
        if (e instanceof Error) {
            setError(e.message);
        } else {
            setError('An unknown error occurred');
        }
      } finally {
        setLoading(false);
      }
    }
    loadResults();
  }, []);

  if (loading) {
    return (
      <div className="home">
        <h1 className="title">Squig-Rank</h1>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="home">
        <h1 className="title">Squig-Rank</h1>
        <div className="error">
          <p>No scan results available yet.</p>
          <p className="error-detail">The scanner runs every 30 minutes. Check back soon!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      <h1 className="title">Squig-Rank</h1>
      <p className="subtitle">IEM Preference Prediction Index Rankings</p>
      <div className="meta">
        <span>{totalIEMs.toLocaleString()} IEMs scanned</span>
        {lastUpdate && (
          <span className="last-update">
            Updated {new Date(lastUpdate).toLocaleString()}
          </span>
        )}
      </div>
      
      <TargetSubmission />
      
      <SimilarityList results={results} />
    </div>
  );
}
