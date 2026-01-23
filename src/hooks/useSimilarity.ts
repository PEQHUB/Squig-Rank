import { useState, useEffect } from 'react';
import type { CalculationResult } from '../types';

export function useSimilarity() {
  const [results, setResults] = useState<CalculationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/calculate');
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        setResults(data);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch results');
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, []);

  return { results, loading, error };
}
