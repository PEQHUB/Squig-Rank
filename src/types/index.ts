// Phone book entry types from squig.link
export interface PhoneBookBrand {
  name: string;
  phones: PhoneBookPhone[];
}

export interface PhoneBookPhone {
  name: string;
  file: string | string[];  // filename(s) without extension
  suffix?: string | string[];
  price?: string;  // e.g. "$100", "$1,200"
  reviewScore?: string;
  shopLink?: string;
  amazon?: string;
}

// Parsed phone entry for internal use
export interface ParsedPhone {
  brandName: string;
  phoneName: string;
  displayName: string;  // "Brand PhoneName"
  fileName: string;     // Primary file to fetch (first if array)
  price: number | null;
  domain: string;
  quality: 'high' | 'low';
  type: 'iem' | 'headphone' | 'tws';
}

// Frequency response data
export interface FrequencyCurve {
  frequencies: number[];
  db: number[];
}

export interface R40Curve {
  frequencies: number[];
  db: number[];
}

// IEM with measurement data
export interface IEM {
  id: string;
  name: string;
  frequencyData: FrequencyCurve;
  sourceDomain: string;
  quality: 'high' | 'low';
  price: number | null;
  type: 'iem' | 'headphone' | 'tws';
  rig?: '711' | '5128';
  pinna?: 'kb5' | 'kb0065' | '5128' | 'gras';
}

// IEM with similarity score
export interface ScoredIEM extends IEM {
  similarity: number;
  // PPI-specific metrics (only present for Harman PPI scoring)
  stdev?: number;
  slope?: number;
  avgError?: number;
  rig?: '711' | '5128';
  targetVariant?: '711' | '5128';
}

// Error tracking
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

// API response
export interface CalculationResult {
  targetName: string;
  targetFileName?: string;
  targetFiles?: {
    '711': string | null;
    '5128': string | null;
  };
  scoringMethod?: 'ppi' | 'rms';  // Now always PPI
  ranked: ScoredIEM[];  // All ranked IEMs for pagination
}

// Custom target for client-side calculation
export interface CustomTarget {
  name: string;
  fileName: string;
  curve: FrequencyCurve;
  addedAt: string;
}

// Scan progress (for future use)
export interface ScanProgress {
  totalDomains: number;
  completedDomains: number;
  totalIEMs: number;
  currentDomain?: string;
}
