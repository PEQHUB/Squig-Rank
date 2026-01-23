import { useSimilarity } from '../hooks/useSimilarity';
import { SimilarityList } from '../components/SimilarityList';

export default function Home() {
  const { results, loading, error } = useSimilarity();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="home">
      <h1 className="title">Squiglink Scanner</h1>
      <SimilarityList results={results} />
    </div>
  );
}
