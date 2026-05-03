import { useCallback, useMemo } from 'react';
import type { FrequencyRange } from '../types';

// Logarithmic mapping: slider position 0-100 maps to 20Hz-20kHz
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);
const LOG_RANGE = LOG_MAX - LOG_MIN;

function freqToPosition(freq: number): number {
  return ((Math.log10(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq))) - LOG_MIN) / LOG_RANGE) * 100;
}

function positionToFreq(pos: number): number {
  return Math.round(Math.pow(10, LOG_MIN + (pos / 100) * LOG_RANGE));
}

// Snap to nearest PPI frequency point for clean values
const PPI_FREQUENCIES = [
  20, 21.2, 22.4, 23.6, 25, 26.5, 28, 30, 31.5, 33.5, 35.5, 37.5, 40, 42.5, 45,
  47.5, 50, 53, 56, 60, 63, 67, 71, 75, 80, 85, 90, 95, 100, 106, 112, 118, 125,
  132, 140, 150, 160, 170, 180, 190, 200, 212, 224, 236, 250, 265, 280, 300, 315,
  335, 355, 375, 400, 425, 450, 475, 500, 530, 560, 600, 630, 670, 710, 750, 800,
  850, 900, 950, 1000, 1060, 1120, 1180, 1250, 1320, 1400, 1500, 1600, 1700, 1800,
  1900, 2000, 2120, 2240, 2360, 2500, 2650, 2800, 3000, 3150, 3350, 3550, 3750,
  4000, 4250, 4500, 4750, 5000, 5300, 5600, 6000, 6300, 6700, 7100, 7500, 8000,
  8500, 9000, 9500, 10000, 10600, 11200, 11800, 12500, 13200, 14000, 15000, 16000,
  17000, 18000, 19000, 20000,
];

function snapToPpiFreq(freq: number): number {
  let closest = PPI_FREQUENCIES[0];
  let minDist = Math.abs(freq - closest);
  for (const f of PPI_FREQUENCIES) {
    const dist = Math.abs(freq - f);
    if (dist < minDist) {
      minDist = dist;
      closest = f;
    }
  }
  return closest;
}

// Format frequency for display
function formatFreq(freq: number): string {
  if (freq >= 10000 && freq % 1000 === 0) return `${freq / 1000}kHz`;
  if (freq >= 1000) {
    const khz = freq / 1000;
    return khz === Math.floor(khz) ? `${Math.floor(khz)}kHz` : `${khz.toFixed(1)}kHz`;
  }
  return `${freq}Hz`;
}

interface Props {
  value: FrequencyRange;
  onChange: (range: FrequencyRange) => void;
  disabled?: boolean;
}

export function FrequencyRangeSlider({ value, onChange, disabled }: Props) {
  const minPos = useMemo(() => freqToPosition(value.min), [value.min]);
  const maxPos = useMemo(() => freqToPosition(value.max), [value.max]);

  const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFreq = positionToFreq(parseFloat(e.target.value));
    const freq = snapToPpiFreq(rawFreq);
    if (freq < value.max) {
      onChange({ min: freq, max: value.max });
    }
  }, [value.max, onChange]);

  const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFreq = positionToFreq(parseFloat(e.target.value));
    const freq = snapToPpiFreq(rawFreq);
    if (freq > value.min) {
      onChange({ min: value.min, max: freq });
    }
  }, [value.min, onChange]);

  return (
    <div className="frequency-range-slider">
      <div className="freq-range-header">
        <span className="slider-label">PPI Band</span>
        <span className="freq-range-display">
          {formatFreq(value.min)} &ndash; {formatFreq(value.max)}
        </span>
      </div>
      <div className="freq-range-track-wrapper">
        <div className="freq-range-track">
          <div
            className="freq-range-track-active"
            style={{ left: `${minPos}%`, width: `${maxPos - minPos}%` }}
          />
        </div>
        <input
          type="range"
          className="freq-range-input freq-range-min"
          min={0}
          max={100}
          step={0.1}
          value={minPos}
          onChange={handleMinChange}
          disabled={disabled}
        />
        <input
          type="range"
          className="freq-range-input freq-range-max"
          min={0}
          max={100}
          step={0.1}
          value={maxPos}
          onChange={handleMaxChange}
          disabled={disabled}
        />
      </div>
      {/* Tick marks for octave references */}
      <div className="freq-range-ticks">
        {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map(f => (
          <span
            key={f}
            className="freq-range-tick"
            style={{ left: `${freqToPosition(f)}%` }}
          >
            {formatFreq(f)}
          </span>
        ))}
      </div>
    </div>
  );
}
