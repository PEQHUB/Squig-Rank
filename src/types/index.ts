export interface FrequencyCurve {
  frequencies: number[];
  db: number[];
}

export interface R40Curve {
  frequencies: number[];
  db: number[];
}

export interface IEM {
  id: string;
  name: string;
  frequencyData: FrequencyCurve;
  sourceDomain: string;
  quality: 'high' | 'low';
}

export interface TargetCurve {
  name: string;
  frequencies: number[];
  db: number[];
}

export interface ScoredIEM extends IEM {
  similarity: number;
  price: number | null;
}

export interface ErrorEntry {
  domain: string;
  error: string;
  timestamp: string;
  iemId?: string;
}

export interface ErrorLog {
  errors: ErrorEntry[];
  lastUpdated: string;
}

export interface CalculationResult {
  targetName: string;
  top25: ScoredIEM[];
}
