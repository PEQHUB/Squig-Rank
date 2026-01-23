import type { FrequencyCurve } from '../types';

async function loadTargetCurve(targetName: string): Promise<FrequencyCurve> {
  const response = await fetch(`/targets/${targetName}.txt`);
  const text = await response.text();

  const frequencies: number[] = [];
  const db: number[] = [];

  const lines = text.trim().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const freq = parseFloat(parts[0]);
      const dbVal = parseFloat(parts[1]);

      if (!isNaN(freq) && !isNaN(dbVal)) {
        frequencies.push(freq);
        db.push(dbVal);
      }
    }
  }

  return { frequencies, db };
}

export { loadTargetCurve };
