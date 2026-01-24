import { SimilarityList } from '../components/SimilarityList';
import type { CalculationResult } from '../types';

const DEMO_RESULTS: CalculationResult[] = [
  {
    targetName: 'ISO 11904-2 DF',
    top25: [
      { id: '1', name: 'Sony IER-Z1R', similarity: 94.2, price: 1699, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '2', name: 'Sennheiser IE 900', similarity: 92.5, price: 1499, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '3', name: 'Campfire Andromeda', similarity: 90.1, price: 999, quality: 'low', sourceDomain: 'superreview.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '4', name: 'Moondrop Aria', similarity: 87.2, price: 149, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '5', name: 'Truthear Hola', similarity: 85.6, price: 49, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '6', name: 'Fiio FH9', similarity: 84.1, price: 699, quality: 'high', sourceDomain: 'earphonesarchive.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '7', name: 'See Audio Yume', similarity: 82.8, price: 179, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '8', name: 'Kiwi Ears Cadenza', similarity: 81.5, price: 129, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '9', name: 'Tin HiFi P2', similarity: 80.2, price: 79, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '10', name: 'Moondrop Blessing 2', similarity: 79.1, price: 299, quality: 'high', sourceDomain: 'sai.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '11', name: 'ThieAudio Monarch', similarity: 78.3, price: 399, quality: 'high', sourceDomain: 'sai.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '12', name: 'Simgot EA1000', similarity: 77.5, price: 189, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '13', name: 'AFUL P5', similarity: 76.8, price: 129, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '14', name: 'Hidition Viento-B', similarity: 76.1, price: 599, quality: 'high', sourceDomain: 'earphonesarchive.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '15', name: 'Divinus Velvet', similarity: 75.4, price: 99, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '16', name: 'QDC Anole', similarity: 74.8, price: 899, quality: 'high', sourceDomain: 'sai.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '17', name: 'Empire Ears Phantom', similarity: 74.2, price: 1999, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '18', name: '64 Audio U6', similarity: 73.6, price: 1099, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '19', name: 'Noble Katana', similarity: 73.1, price: 799, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '20', name: 'Vision Ears VE7', similarity: 72.5, price: 1499, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '21', name: 'Earsonics S-EM9', similarity: 72.0, price: 899, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '22', name: 'Jomo Audio H2O', similarity: 71.5, price: 699, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '23', name: 'Unique Melody MEST', similarity: 71.0, price: 1199, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '24', name: 'Heir Audio 8.A', similarity: 70.5, price: 799, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '25', name: 'Razer Moray', similarity: 70.1, price: 99, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } }
    ]
  },
  {
    targetName: 'Harman 2019',
    top25: [
      { id: '1', name: 'Truthear Hola', similarity: 91.8, price: 49, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '2', name: 'Moondrop Aria', similarity: 89.3, price: 149, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '3', name: 'Sony IER-Z1R', similarity: 88.7, price: 1699, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '4', name: 'Fiio FH9', similarity: 86.5, price: 699, quality: 'high', sourceDomain: 'earphonesarchive.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '5', name: 'Sennheiser IE 900', similarity: 85.9, price: 1499, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '6', name: 'Moondrop Blessing 2', similarity: 84.8, price: 299, quality: 'high', sourceDomain: 'sai.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '7', name: 'See Audio Yume', similarity: 83.2, price: 179, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '8', name: 'Kiwi Ears Cadenza', similarity: 82.1, price: 129, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '9', name: 'ThieAudio Monarch', similarity: 81.5, price: 399, quality: 'high', sourceDomain: 'sai.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '10', name: 'Tin HiFi P2', similarity: 80.8, price: 79, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '11', name: 'Simgot EA1000', similarity: 80.1, price: 189, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '12', name: 'AFUL P5', similarity: 79.5, price: 129, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '13', name: 'Campfire Andromeda', similarity: 78.9, price: 999, quality: 'low', sourceDomain: 'superreview.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '14', name: 'Hidition Viento-B', similarity: 78.3, price: 599, quality: 'high', sourceDomain: 'earphonesarchive.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '15', name: 'Divinus Velvet', similarity: 77.7, price: 99, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '16', name: 'QDC Anole', similarity: 77.1, price: 899, quality: 'high', sourceDomain: 'sai.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '17', name: 'Empire Ears Phantom', similarity: 76.5, price: 1999, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '18', name: '64 Audio U6', similarity: 76.0, price: 1099, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '19', name: 'Noble Katana', similarity: 75.5, price: 799, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '20', name: 'Vision Ears VE7', similarity: 75.0, price: 1499, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '21', name: 'Earsonics S-EM9', similarity: 74.5, price: 899, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '22', name: 'Jomo Audio H2O', similarity: 74.0, price: 699, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '23', name: 'Unique Melody MEST', similarity: 73.5, price: 1199, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '24', name: 'Heir Audio 8.A', similarity: 73.0, price: 799, quality: 'high', sourceDomain: 'crinacle.squig.link', frequencyData: { frequencies: [], db: [] } },
      { id: '25', name: 'Razer Moray', similarity: 72.5, price: 99, quality: 'low', sourceDomain: 'squig.link', frequencyData: { frequencies: [], db: [] } }
    ]
  }
];

export default function Home() {
  return (
    <div className="home">
      <h1 className="title">Squiglink Scanner</h1>
      <SimilarityList results={DEMO_RESULTS} />
    </div>
  );
}
