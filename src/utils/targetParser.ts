import type { FrequencyCurve } from '../types';

/**
 * Parse target curve from text file
 * Supports formats:
 * - "frequency db" (whitespace separated)
 * - "frequency\tdb" (tab separated)
 * - REW format with headers/comments starting with *
 */
function parseTargetText(text: string): FrequencyCurve {
  const frequencies: number[] = [];
  const db: number[] = [];
  
  const lines = text.trim().split(/[\r\n]+/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse whitespace/tab separated values
    const parts = trimmed.split(/[\s\t,]+/);
    if (parts.length >= 2) {
      const freq = parseFloat(parts[0]);
      const dbVal = parseFloat(parts[1]);
      
      if (!isNaN(freq) && !isNaN(dbVal) && freq > 0) {
        frequencies.push(freq);
        db.push(dbVal);
      }
    }
  }
  
  return { frequencies, db };
}

/**
 * Load target curve from public folder
 */
async function loadTargetCurve(targetName: string): Promise<FrequencyCurve> {
  // Handle both with and without .txt extension
  const fileName = targetName.endsWith('.txt') ? targetName : `${targetName}.txt`;
  const response = await fetch(`./targets/${fileName}`);
  
  if (!response.ok) {
    throw new Error(`Failed to load target: ${targetName}`);
  }
  
  const text = await response.text();
  return parseTargetText(text);
}

/**
 * Validate that a frequency curve has reasonable data
 */
function validateCurve(curve: FrequencyCurve): boolean {
  // Must have at least 10 data points
  if (curve.frequencies.length < 10) return false;
  
  // Frequencies should span a reasonable range
  const minFreq = Math.min(...curve.frequencies);
  const maxFreq = Math.max(...curve.frequencies);
  
  if (minFreq > 100 || maxFreq < 10000) return false;
  
  // dB values should be in a reasonable range
  const minDb = Math.min(...curve.db);
  const maxDb = Math.max(...curve.db);
  
  if (maxDb - minDb > 100) return false; // Too much variance
  
  return true;
}

export { loadTargetCurve, parseTargetText, validateCurve };
