// Category filter for selecting which measurement category to view
export type CategoryFilter = 'iem' | 'hp_kb5' | 'hp_5128' | 'iem_5128';

// OE/IE measurement mode toggle
export type MeasurementMode = 'oe' | 'ie';

// Target selection for IEMs
export type IEMTarget = 'harman' | 'iso';

// Target selection for KEMAR KB5 headphones
export type KEMARTarget = 'harman' | 'kemar';

// Target selection for B&K 5128 headphones
export type HP5128Target = 'harman' | 'df';

// Combined target selection state
export interface TargetSelection {
  iem: IEMTarget;
  hp_kb5: KEMARTarget;
  hp_5128: HP5128Target;
}

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
  // Timestamps for tracking when devices were first added
  firstSeen?: string;  // YYYY-MM-DD format
  lastSeen?: string;   // YYYY-MM-DD format
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
    '711'?: string | null;
    '5128'?: string | null;
    'kb5'?: string | null;
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

// Latest device with category metadata
export interface LatestDevice extends ScoredIEM {
  category: 'iem' | 'hp_kb5' | 'hp_5128' | 'iem_5128';
  categoryLabel: string;
  targetName: string;
}

// Latest results data structure
export interface LatestResultsData {
  generatedAt: string;
  totalDevices: number;
  category: string;
  categoryLabel: string;
  devices: LatestDevice[];
}

// Results data structure (for existing tabs)
export interface ResultsData {
  generatedAt: string;
  totalIEMs: number;
  domainsScanned?: number;
  rigType?: string;
  results: CalculationResult[];
}

// ============================================================================
// DF TARGET BUILDER TYPES
// ============================================================================

// Builder parameter state for a single category
export interface BuilderParams {
  tilt: number;       // dB/octave (e.g. -0.8)
  bassGain: number;   // dB for low shelf at 105 Hz
  trebleGain: number; // dB for high shelf at 2500 Hz
}

// Per-category builder parameter state
export interface BuilderState {
  iem: BuilderParams;
  hp_kb5: BuilderParams;
  hp_5128: BuilderParams;
  iem_5128: BuilderParams;
}

// Per-category builder scoring results
export interface BuilderResults {
  iem: CalculationResult | null;
  hp_kb5: CalculationResult | null;
  hp_5128: CalculationResult | null;
  iem_5128: CalculationResult | null;
}
